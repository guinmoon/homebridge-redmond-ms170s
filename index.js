const EventEmitter = require("events");
var Service, Characteristic;
const packageJson = require("./package.json");
var ms170s = require("./rk-ms170s.js");

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory("homebridge-r4s", "ms170s", Boiler);
};

class _Ms170sEmitter extends EventEmitter {}

const _ms170sEmitter = new _Ms170sEmitter();

function Boiler(log, config) {
    this.log = log;
    this.name = config.name;
    this.manufacturer = config.manufacturer || packageJson.author.name;
    this.serial = config.serial || "00000000000";
    this.model = config.model || packageJson.name;
    this.firmware = config.firmware || packageJson.version;

    this.mac = config.mac;
    this.temperatureDisplayUnits = config.temperatureDisplayUnits || 0;
    this.currentRelativeHumidity = config.currentRelativeHumidity || false;
    this.minStep = config.minStep || 1;
    this.chMin = config.chMin || 40;
    this.chMax = config.chMax || 100;

    this.currentHeatingCoolingState = 0;
    this.targetHeatingCoolingState = 0;
    this.currentTemperature = 0;
    this.targetTemperature = 0;

    // this.latestCurrentHeatingCoolingState = 0;
    // this.latestTargetHeatingCoolingState = 0;
    // this.latestCurrentTemperature = 10;
    // this.latestTargetTemperature = 0;
}

Boiler.prototype = {
    identify: function(callback) {
        this.log("Identify requested!");
        callback();
    },

    updateDevice: function(parameters, callback) {
        error = undefined;
        var res_data = {};
        res_data.currentHeatingCoolingState = this.currentHeatingCoolingState;
        res_data.targetHeatingCoolingState = this.targetHeatingCoolingState;
        res_data.currentTemperature = this.currentTemperature;
        res_data.targetTemperature = this.targetTemperature;
        if (parameters.action == "status") {
            console.log(this.latestCurrentTemperature);
            callback(error, res_data);
            this._ms170sRequest(
                parameters,
                function(error, responseBody) {
                    console.log(responseBody);
                    this.updateValues(responseBody);
                }.bind(this)
            );
        }
        if (
            parameters.action == "off" ||
            parameters.action == "boil" ||
            parameters.action == "heat"
        ) {
            callback(error, res_data);
            this._ms170sRequest(
                parameters,
                function(error, responseBody) {
                    if (responseBody.status == "ok") {
                        responseBody.currentHeatingCoolingState = 1;
                        if (parameters.action == "off")
                            responseBody.currentHeatingCoolingState = 0;
                        if (parameters.action == "boil")
                            responseBody.targetTemperature = 100;
                        this.updateValues(responseBody);
                    }
                }.bind(this)
            );
        }
    },

    _ms170sRequest: function(parameters, callback) {
        this.log.debug(parameters);
        var res_data = {};
        error = undefined;
        if (parameters.action == "status") {
            ms170s.ms170s_run(parameters, _ms170sEmitter);
            _ms170sEmitter.on("data_ok", function(data) {
                res_data = data;
                if (
                    res_data.currentHeatingCoolingState == 1 &&
                    res_data.targetTemperature == "none"
                )
                    res_data.targetTemperature = 100; //Boil mode
                _ms170sEmitter.removeAllListeners();
                callback(error, res_data);
            });
        }
        if (parameters.action == "off" || parameters.action == "boil") {
            ms170s.ms170s_run(parameters, _ms170sEmitter);
            _ms170sEmitter.on("data_ok", function(data) {
                res_data = data;
                _ms170sEmitter.removeAllListeners();
                callback(error, res_data);
            });
        }
        if (parameters.action == "heat") {
            parameters.action = "off";
            ms170s.ms170s_run(parameters, _ms170sEmitter);
            _ms170sEmitter.on("data_ok", function(data) {
                res_data = data;
                _ms170sEmitter.removeAllListeners();
                parameters.action = "heat";
                ms170s.ms170s_run(parameters, _ms170sEmitter);
                _ms170sEmitter.on("data_ok", function(data) {
                    res_data = data;
                    _ms170sEmitter.removeAllListeners();
                    callback(error, res_data);
                });
            });
        }
    },

    updateValues: function(responseBody) {
        this.log.debug("Device response: %s", JSON.stringify(responseBody));
        var json = responseBody;
        this.chService
            .getCharacteristic(Characteristic.TargetTemperature)
            .updateValue(json.targetTemperature);
        this.log(
            "CH | Updated TargetTemperature to: %s",
            json.targetTemperature
        );
        this.chService
            .getCharacteristic(Characteristic.CurrentTemperature)
            .updateValue(json.currentTemperature);
        this.log(
            "CH | Updated CurrentTemperature to: %s",
            json.currentTemperature
        );
        this.chService
            .getCharacteristic(Characteristic.TargetHeatingCoolingState)
            .updateValue(json.targetHeatingCoolingState);
        this.log(
            "CH | Updated TargetHeatingCoolingState to: %s",
            json.targetHeatingCoolingState
        );
        this.chService
            .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
            .updateValue(json.currentHeatingCoolingState);
        this.log(
            "CH | Updated CurrentHeatingCoolingState to: %s",
            json.currentHeatingCoolingState
        );
    },

    _getStatus: function(callback) {
        this.log.debug("Getting status");
        var parameters = {};
        parameters.action = "status";
        parameters.mac = this.mac;
        this.updateDevice(
            parameters,
            function(error, responseBody) {
                if (error) {
                    this.log.warn("Error getting status: %s", error.message);
                    this.chService
                        .getCharacteristic(
                            Characteristic.CurrentHeatingCoolingState
                        )
                        .updateValue(new Error("Polling failed")); 
                    callback(error);
                } else {
                    this.updateValues(responseBody);
                    callback();
                }
            }.bind(this)
        );
    },

    setTargetHeatingCoolingState: function(value, callback) {
        var parameters = {};
        if (value == 1) {
            parameters.action = "boil";
            parameters.temperature = 100;
        } else {
            parameters.action = "off";
        }
        parameters.mac = this.mac;
        this.log.debug("CH | Setting targetHeatingCoolingState");
        this.updateDevice(
            parameters,
            function(error, res_data) {
                if (res_data.status != "ok") {
                    this.log.warn(
                        "CH | Error setting targetHeatingCoolingState: %s",
                        res_data.status
                    );
                    callback(error);
                } else {
                    this.log(
                        "CH | Set targetHeatingCoolingState to: %s",
                        value
                    );
                    callback();
                }
            }.bind(this)
        );
    },

    setTargetTemperature: function(value, callback) {
        var parameters = {};
        parameters.action = "heat";
        parameters.temperature = value;
        parameters.mac = this.mac;
        this.log.debug("CH | Setting targetTemperature");
        this.updateDevice(
            parameters,
            function(error, res_data) {
                if (res_data.status != "ok") {
                    this.log.warn(
                        "CH | Error setting targetTemperature: %s",
                        res_data.status
                    );
                    callback(error);
                } else {
                    this.log("CH | Set targetTemperature to: %s", value);
                    callback();
                }
            }.bind(this)
        );
    },

    getServices: function() {
        this.informationService = new Service.AccessoryInformation();
        this.informationService
            .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
            .setCharacteristic(Characteristic.Model, this.model)
            .setCharacteristic(Characteristic.SerialNumber, this.serial)
            .setCharacteristic(Characteristic.FirmwareRevision, this.firmware);

        this.chService = new Service.Thermostat(this.name, 1);
        this.chService
            .getCharacteristic(Characteristic.TemperatureDisplayUnits)
            .updateValue(this.temperatureDisplayUnits);

        this.chService
            .getCharacteristic(Characteristic.TargetHeatingCoolingState)
            .on("set", this.setTargetHeatingCoolingState.bind(this))
            .setProps({
                maxValue: Characteristic.TargetHeatingCoolingState.HEAT
            });

        this.chService
            .getCharacteristic(Characteristic.TargetTemperature)
            .on("set", this.setTargetTemperature.bind(this))
            .setProps({
                minValue: this.chMin,
                maxValue: this.chMax,
                minStep: this.minStep
                // minValue: 40,
                // maxValue: 100,
                // minStep: 5
            });

        this.chService
            .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
            .on("get", this._getStatus.bind(this));

        this.chService
            .getCharacteristic(Characteristic.CurrentTemperature)
            .on("get", this._getStatus.bind(this));

        var services = [this.informationService, this.chService];

        // this._getStatus(function() {});
        // setInterval(
        //     function() {
        //         this._getStatus(function() {});
        //     }.bind(this),1000
        // );
        return services;
    }
};
