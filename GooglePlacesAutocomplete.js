import React, { Component } from 'react';
import PropTypes from "prop-types";

import {
  TextInput,
  View,
  ScrollView,
  Image,
  Text,
  StyleSheet,
  Dimensions,
  TouchableHighlight,
  TouchableWithoutFeedback,
  Platform,
  ActivityIndicator,
  PixelRatio
} from 'react-native';

import ListView from 'deprecated-react-native-listview'

import Qs from 'qs';

const WINDOW = Dimensions.get('window');

const defaultStyles = {
  container: {
    flex: 1,
  },
  textInputContainer: {
    backgroundColor: '#C9C9CE',
    height: 44,
    borderTopColor: '#7e7e7e',
    borderBottomColor: '#b5b5b5',
    borderTopWidth: 1 / PixelRatio.get(),
    borderBottomWidth: 1 / PixelRatio.get(),
    flexDirection: 'row',
  },
  textInput: {
    backgroundColor: '#FFFFFF',
    height: 28,
    borderRadius: 5,
    paddingTop: 4.5,
    paddingBottom: 4.5,
    paddingLeft: 10,
    paddingRight: 10,
    marginTop: 7.5,
    marginLeft: 8,
    marginRight: 8,
    fontSize: 15,
    flex: 1
  },
  poweredContainer: {
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  powered: {},
  listView: {
    // flex: 1,
  },
  row: {
    padding: 13,
    height: 44,
    flexDirection: 'row',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#c8c7cc',
  },
  description: {},
  loader: {
    // flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    height: 20,
  },
  androidLoader: {
    marginRight: -15,
  },
};

export default class GooglePlacesAutocomplete extends Component {

  constructor(props) {
    super(props);
    this.state = this.getInitialState();
    this._results = []
    this._requests = []
  }

  getInitialState() {
    const ds = new ListView.DataSource({
      rowHasChanged: function rowHasChanged(r1, r2) {
        if (typeof r1.isLoading !== 'undefined') {
          return true;
        }
        return r1 !== r2;
      }
    });
    return {
      text: this.props.getDefaultValue(),
      dataSource: ds.cloneWithRows(this.buildRowsFromResults([])),
      listViewDisplayed: this.props.listViewDisplayed === 'auto' ? false : this.props.listViewDisplayed,
    };
  }

  setAddressText(address) {
    this.setState({
      text: address
    })
  }

  getAddressText() {
    return this.state.text
  }

  buildRowsFromResults(results) {
    var res = null;

    if (results.length === 0 || this.props.predefinedPlacesAlwaysVisible === true) {
      res = [...this.props.predefinedPlaces];
      if (this.props.currentLocation === true) {
        res.unshift({
          description: this.props.currentLocationLabel,
          isCurrentLocation: true,
        });
      }
    } else {
      res = [];
    }

    res = res.map(function(place) {
      return {
        ...place,
        isPredefinedPlace: true,
      }
    });

    return [...res, ...results];
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.listViewDisplayed !== 'auto') {
      this.setState({
        listViewDisplayed: nextProps.listViewDisplayed,
      });
    }
  }

  componentWillUnmount() {
    this._abortRequests();
  }

  _abortRequests() {
    for (let i = 0; i < this._requests.length; i++) {
      this._requests[i].abort();
    }
    this._requests = [];

    if (this._autocompleteRequests) {
      for (let i = 0; i < this._autocompleteRequests.length; i++) {
        clearTimeout(this._autocompleteRequests[i]);
      }
    }
    this._autocompleteRequests = []
  }

  /**
   * This method is exposed to parent components to focus on textInput manually.
   * @public
   */
  triggerFocus() {
    if (this.refs.textInput) this.refs.textInput.focus();
  }

  /**
   * This method is exposed to parent components to blur textInput manually.
   * @public
   */
  triggerBlur() {
    if (this.refs.textInput) this.refs.textInput.blur();
  }

  getCurrentLocation() {
    let options = null;
    if (this.props.enableHighAccuracyLocation)
      options = (Platform.OS === 'android') ? {
        enableHighAccuracy: true,
        timeout: 20000
      } : {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 1000
      };
    let getCurrentPosition = this.props.getCurrentPosition ||
      navigator.geolocation.getCurrentPosition;
    getCurrentPosition(
      (position) => {
        if (this.props.nearbyPlacesAPI === 'None') {
          let currentLocation = {
            description: this.props.currentLocationLabel,
            geometry: {
              location: {
                lat: position.coords.latitude,
                lng: position.coords.longitude
              }
            }
          };
          this._disableRowLoaders();
          this.props.onPress(currentLocation, currentLocation);
        } else {
          this._requestNearby(position.coords.latitude, position.coords.longitude);
        }
      },
      (error) => {
        this._disableRowLoaders();
        alert(error.message);
      },
      options
    );
  }

  _enableRowLoader(rowData) {
    let rows = this.buildRowsFromResults(this._results);
    for (let i = 0; i < rows.length; i++) {
      if ((rows[i].place_id === rowData.place_id) || (rows[i].isCurrentLocation === true && rowData.isCurrentLocation === true)) {
        rows[i].isLoading = true;
        this.setState({
          dataSource: this.state.dataSource.cloneWithRows(rows),
        });
        break;
      }
    }
  }
  _disableRowLoaders() {
    if (this.isMounted()) {
      for (let i = 0; i < this._results.length; i++) {
        if (this._results[i].isLoading === true) {
          this._results[i].isLoading = false;
        }
      }
      this.setState({
        dataSource: this.state.dataSource.cloneWithRows(this.buildRowsFromResults(this._results)),
      });
    }
  }
  _onPress(rowData) {
    if (rowData.isPredefinedPlace !== true && this.props.fetchDetails === true) {
      if (rowData.isLoading === true) {
        // already requesting
        return;
      }

      this._abortRequests();

      // display loader
      this._enableRowLoader(rowData);

      if (this.props.autocompleteSearch) {
        if (this.isMounted()) {
          const details = {
            name: rowData.name,
            description: rowData.description,
            geometry: {
              location: {
                lat: rowData.location.latitude,
                lng: rowData.location.longitude,
              },
            }
          };
          this._disableRowLoaders();
          this._onBlur();

          this.setState({
            text: rowData.description,
          });

          delete rowData.isLoading;
          this.props.onPress(rowData, details);
        }
      }
      else {
        // fetch details
        const request = new XMLHttpRequest();
        this._requests.push(request);
        request.timeout = this.props.timeout;
        request.ontimeout = this.props.onTimeout;
        request.onreadystatechange = () => {
          if (request.readyState !== 4) {
            return;
          }
          if (request.status === 200) {
            const responseJSON = JSON.parse(request.responseText);
            if (responseJSON.status === 'OK') {
              if (this.isMounted()) {
                const details = responseJSON.result;
                this._disableRowLoaders();
                this._onBlur();

                this.setState({
                  text: rowData.description,
                });

                delete rowData.isLoading;
                this.props.onPress(rowData, details);
              }
            } else {
              this._disableRowLoaders();

              if (this.props.autoFillOnNotFound) {
                this.setState({
                  text: rowData.description,
                });
                delete rowData.isLoading;
              }

              if (!this.props.onNotFound)
                console.warn('google places autocomplete: ' + responseJSON.status);
              else
                this.props.onNotFound(responseJSON);
            }
          } else {
            this._disableRowLoaders();

            if (!this.props.onFail)
              console.warn('google places autocomplete: request could not be completed or has been aborted');
            else
              this.props.onFail();
          }
        };
        request.open('GET', 'https://maps.googleapis.com/maps/api/place/details/json?' + Qs.stringify({
          key: this.props.query.key,
          placeid: rowData.place_id,
          language: this.props.query.language,
          fields: this.props.query.fields,
          sessiontoken: this.props.query.sessiontoken,
        }));
        request.send();
      }
    } else if (rowData.isCurrentLocation === true) {

      // display loader
      this._enableRowLoader(rowData);


      this.setState({
        text: rowData.description,
      });
      this.triggerBlur(); // hide keyboard but not the results

      delete rowData.isLoading;

      this.getCurrentLocation();

    } else {
      this.setState({
        text: rowData.description,
      });

      this._onBlur();

      delete rowData.isLoading;

      let predefinedPlace = this._getPredefinedPlace(rowData);

      // sending predefinedPlace as details for predefined places
      this.props.onPress(predefinedPlace, predefinedPlace);
    }
  }

  _getPredefinedPlace(rowData) {
    if (rowData.isPredefinedPlace !== true) {
      return rowData;
    }
    for (let i = 0; i < this.props.predefinedPlaces.length; i++) {
      if (this.props.predefinedPlaces[i].description === rowData.description) {
        return this.props.predefinedPlaces[i];
      }
    }
    return rowData;
  }

  _filterResultsByTypes(responseJSON, types) {
    if (types.length === 0) return responseJSON.results;

    var results = [];
    for (let i = 0; i < responseJSON.results.length; i++) {
      let found = false;
      for (let j = 0; j < types.length; j++) {
        if (responseJSON.results[i].types.indexOf(types[j]) !== -1) {
          found = true;
          break;
        }
      }
      if (found === true) {
        results.push(responseJSON.results[i]);
      }
    }
    return results;
  }


  _requestNearby(latitude, longitude) {
    this._abortRequests();
    if (latitude !== undefined && longitude !== undefined && latitude !== null && longitude !== null) {
      const request = new XMLHttpRequest();
      this._requests.push(request);
      request.timeout = this.props.timeout;
      request.ontimeout = this.props.onTimeout;
      request.onreadystatechange = () => {
        if (request.readyState !== 4) {
          return;
        }
        if (request.status === 200) {
          const responseJSON = JSON.parse(request.responseText);

          this._disableRowLoaders();

          if (typeof responseJSON.results !== 'undefined') {
            if (this.isMounted()) {
              var results = [];
              if (this.props.nearbyPlacesAPI === 'GoogleReverseGeocoding') {
                results = this._filterResultsByTypes(responseJSON, this.props.filterReverseGeocodingByTypes);
              } else {
                results = responseJSON.results;
              }

              this.setState({
                dataSource: this.state.dataSource.cloneWithRows(this.buildRowsFromResults(results)),
              });
            }
          }
          if (typeof responseJSON.error_message !== 'undefined') {
            console.warn('google places autocomplete: ' + responseJSON.error_message);
          }
        } else {
          // console.warn("google places autocomplete: request could not be completed or has been aborted");
        }
      };

      let url = '';
      if (this.props.nearbyPlacesAPI === 'GoogleReverseGeocoding') {
        // your key must be allowed to use Google Maps Geocoding API
        url = 'https://maps.googleapis.com/maps/api/geocode/json?' + Qs.stringify({
          latlng: latitude + ',' + longitude,
          key: this.props.query.key,
          ...this.props.GoogleReverseGeocodingQuery,
        });
      } else {
        url = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json?' + Qs.stringify({
          location: latitude + ',' + longitude,
          key: this.props.query.key,
          ...this.props.GooglePlacesSearchQuery,
        });
      }

      request.open('GET', url);
      request.send();
    } else {
      this._results = [];
      this.setState({
        dataSource: this.state.dataSource.cloneWithRows(this.buildRowsFromResults([])),
      });
    }
  }



  _request(text) {
    this._abortRequests();
    if (text.length >= this.props.minLength) {

      if (this.props.autocompleteSearch){

        this._autocompleteRequests.push(setTimeout(() => {
          this.props.autocompleteSearch(text, this.props.query.sessiontoken)
            .then((result) => {
                if (typeof result !== 'undefined') {
                  if (this.isMounted()) {
                    this._results = result;
                    this.setState({
                      dataSource: this.state.dataSource.cloneWithRows(result),
                    });
                  }
                }
              }
            )
        }, this.props.delay));
      }
      else {
        const request = new XMLHttpRequest();
        this._requests.push(request);
        request.timeout = this.props.timeout;
        request.ontimeout = this.props.onTimeout;
        request.onreadystatechange = () => {
          if (request.readyState !== 4) {
            return;
          }
          if (request.status === 200) {
            const responseJSON = JSON.parse(request.responseText);
            if (typeof responseJSON.predictions !== 'undefined') {
              if (this.isMounted()) {
                this._results = responseJSON.predictions;
                this.setState({
                  dataSource: this.state.dataSource.cloneWithRows(this.buildRowsFromResults(responseJSON.predictions)),
                });
              }
            }
            if (typeof responseJSON.error_message !== 'undefined') {
              console.warn('google places autocomplete: ' + responseJSON.error_message);
            }
          } else {
            // console.warn("google places autocomplete: request could not be completed or has been aborted");
          }
        };
        request.open('GET', 'https://maps.googleapis.com/maps/api/place/autocomplete/json?&input=' + encodeURIComponent(text) + '&' + Qs.stringify(this.props.query));
        request.send();
      }
    } else {
      this._results = [];
      this.setState({
        dataSource: this.state.dataSource.cloneWithRows(this.buildRowsFromResults([])),
      });
    }
  }
  _onChangeText(text) {
    this._request(text);
    this.setState({
      text: text,
      listViewDisplayed: true,
    });
  }

  _getRowLoader() {
    return (
      <ActivityIndicator
        animating={true}
        size="small"
      />
    );
  }

  _renderRowData(rowData) {
    if (this.props.renderRow) {
      return this.props.renderRow(rowData);
    }

    return (
      <Text style={[{flex: 1}, defaultStyles.description, this.props.styles.description, rowData.isPredefinedPlace ? this.props.styles.predefinedPlacesDescription : {}]}
            numberOfLines={1}
      >
        {this._renderDescription(rowData)}
      </Text>
    );
  }

  _renderDescription(rowData) {
    if (this.props.renderDescription) {
      return this.props.renderDescription(rowData);
    }

    return rowData.description || rowData.formatted_address || rowData.name;
  }

  _renderLoader(rowData) {
    if (rowData.isLoading === true) {
      return (
        <View
          style={[defaultStyles.loader, this.props.styles.loader]}
        >
          {this._getRowLoader()}
        </View>
      );
    }
    return null;
  }

  _renderRow(rowData = {}, sectionID, rowID) {
    return (
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps={this.props.keyboardShouldPersistTaps}
        horizontal={true}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}>
        <TouchableHighlight
          style={{ minWidth: WINDOW.width }}
          onPress={() => this._onPress(rowData)}
          underlayColor={this.props.listUnderlayColor || "#c8c7cc"}
        >
          <View style={[defaultStyles.row, this.props.styles.row, rowData.isPredefinedPlace ? this.props.styles.specialItemRow : {}]}>
            {this._renderRowData(rowData)}
            {this._renderLoader(rowData)}
          </View>
        </TouchableHighlight>
      </ScrollView>
    );
  }

  _renderSeparator(sectionID, rowID) {
    if (rowID == this.state.dataSource.getRowCount() - 1) {
      return null
    }

    return (
      <View
        key={ `${sectionID}-${rowID}` }
        style={[defaultStyles.separator, this.props.styles.separator]} />
    );
  }

  _onBlur() {
    this.triggerBlur();
    this.setState({
      listViewDisplayed: false
    });
  }

  _onFocus() {
    this.setState({
      listViewDisplayed: true
    });
  }

  _shouldShowPoweredLogo() {

    if (!this.props.enablePoweredByContainer || this.state.dataSource.getRowCount() == 0) {
      return false
    }

    for (let i = 0; i < this.state.dataSource.getRowCount(); i++) {
      let row = this.state.dataSource.getRowData(0, i);

      if (!row.hasOwnProperty('isCurrentLocation') && !row.hasOwnProperty('isPredefinedPlace')) {
        return true
      }
    }

    return false
  }

  _renderLeftButton() {
    if (this.props.renderLeftButton) {
      return this.props.renderLeftButton()
    }
  }

  _renderRightButton() {
    if (this.props.renderRightButton) {
      return this.props.renderRightButton()
    }
  }

  _renderPoweredLogo() {
    if (!this._shouldShowPoweredLogo()) {
      return null
    }

    return (
      <View
        style={[defaultStyles.row, defaultStyles.poweredContainer, this.props.styles.poweredContainer]}
      >
        <Image
          style={[defaultStyles.powered, this.props.styles.powered]}
          resizeMode={Image.resizeMode.contain}
          source={require('./images/powered_by_google_on_white.png')}
        />
      </View>
    );
  }

  _getListView() {
    if ((this.state.text !== '' || this.props.predefinedPlaces.length || this.props.currentLocation === true) && this.state.listViewDisplayed === true) {
      return (
        <ListView
          keyboardShouldPersistTaps={true}
          keyboardDismissMode="on-drag"
          style={[defaultStyles.listView, this.props.styles.listView]}
          dataSource={this.state.dataSource}
          renderSeparator={this._renderSeparator}
          automaticallyAdjustContentInsets={false}
          {...this.props}
          renderRow={this._renderRow}
          renderFooter={this._renderPoweredLogo}
        />
      );
    }

    return null;
  }
  render() {
    let {
      onChangeText,
      onFocus,
      ...userProps
    } = this.props.textInputProps;
    return (
      <View
        style={[defaultStyles.container, this.props.styles.container]}
      >
        <View
          style={[defaultStyles.textInputContainer, this.props.styles.textInputContainer]}
        >
          {this._renderLeftButton()}
          <TextInput
            { ...userProps }
            ref="textInput"
            autoFocus={this.props.autoFocus}
            style={[defaultStyles.textInput, this.props.styles.textInput]}
            onChangeText={onChangeText ? text => {this._onChangeText(text); onChangeText(text)} : this._onChangeText}
            value={this.state.text}
            placeholder={this.props.placeholder}
            placeholderTextColor={this.props.placeholderTextColor}
            onFocus={onFocus ? () => {this._onFocus(); onFocus()} : this._onFocus}
            clearButtonMode="while-editing"
            underlineColorAndroid={this.props.underlineColorAndroid}
          />
          {this._renderRightButton()}
        </View>
        {this._getListView()}
        {this.props.children}
      </View>
    );
  }
}

GooglePlacesAutocomplete.propTypes = {
  placeholder: PropTypes.string,
  placeholderTextColor: PropTypes.string,
  underlineColorAndroid: PropTypes.string,
  onPress: PropTypes.func,
  onNotFound: PropTypes.func,
  onFail: PropTypes.func,
  minLength: PropTypes.number,
  fetchDetails: PropTypes.bool,
  autoFocus: PropTypes.bool,
  autoFillOnNotFound: PropTypes.bool,
  getDefaultValue: PropTypes.func,
  timeout: PropTypes.number,
  onTimeout: PropTypes.func,
  query: PropTypes.object,
  GoogleReverseGeocodingQuery: PropTypes.object,
  GooglePlacesSearchQuery: PropTypes.object,
  styles: PropTypes.object,
  textInputProps: PropTypes.object,
  enablePoweredByContainer: PropTypes.bool,
  predefinedPlaces: PropTypes.array,
  currentLocation: PropTypes.bool,
  currentLocationLabel: PropTypes.string,
  nearbyPlacesAPI: PropTypes.string,
  enableHighAccuracyLocation: PropTypes.bool,
  getCurrentPosition: PropTypes.func,
  filterReverseGeocodingByTypes: PropTypes.array,
  predefinedPlacesAlwaysVisible: PropTypes.bool,
  enableEmptySections: PropTypes.bool,
  renderDescription: PropTypes.func,
  renderRow: PropTypes.func,
  renderLeftButton: PropTypes.func,
  renderRightButton: PropTypes.func,
  listUnderlayColor: PropTypes.string
};


GooglePlacesAutocomplete.defaultProps = {
  placeholder: 'Search',
  placeholderTextColor: '#A8A8A8',
  underlineColorAndroid: 'transparent',
  onPress: () => {},
  onNotFound: () => {},
  onFail: () => {},
  minLength: 0,
  fetchDetails: false,
  autoFocus: false,
  autoFillOnNotFound: false,
  keyboardShouldPersistTaps: 'always',
  getDefaultValue: () => '',
  timeout: 20000,
  onTimeout: () => console.warn('google places autocomplete: request timeout'),
  query: {
    key: 'missing api key',
    language: 'en',
    types: 'geocode',
  },
  GoogleReverseGeocodingQuery: {},
  GooglePlacesSearchQuery: {
    rankby: 'distance',
    types: 'food',
  },
  styles: {},
  textInputProps: {},
  enablePoweredByContainer: true,
  predefinedPlaces: [],
  currentLocation: false,
  currentLocationLabel: 'Current location',
  nearbyPlacesAPI: 'GooglePlacesSearch',
  enableHighAccuracyLocation: true,
  getCurrentPosition: null,
  filterReverseGeocodingByTypes: [],
  predefinedPlacesAlwaysVisible: false,
  enableEmptySections: true,
  listViewDisplayed: 'auto'
};



// this function is still present in the library to be retrocompatible with version < 1.1.0
const create = function create(options = {}) {
  return React.createClass({
    render() {
      return (
        <GooglePlacesAutocomplete ref="GooglePlacesAutocomplete"
                                  {...options}
        />
      );
    },
  });
};


module.exports = {
  GooglePlacesAutocomplete,
  create
};
