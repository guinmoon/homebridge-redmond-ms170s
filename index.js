const EventEmitter = require("events");
const packageJson = require("./package.json");
var ms170s = require("./rk-ms170s.js");

var Service, Characteristic;

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory("homebridge-r4s", "ms170s", Kettle);
};

class _Ms170sEmitter extends EventEmitter { }
const _ms170sEmitter = new _Ms170sEmitter();

function Kettle(log, config) {
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

    this.pollInterval = config.pollInterval || 4000;
    this.pollingWhenOn = config.pollingWhenOn || false;
    this.pollingEnabled = false;

    this.pollingCounter = 0;
}

Kettle.prototype = {
    identify: function (callback) {
        this.log("Identify requested.");
        callback();
    },

    deviceRequest: function (parameters, callback) {
        error = undefined;
        var res_data = {};
        res_data.currentHeatingCoolingState = this.currentHeatingCoolingState;
        res_data.targetHeatingCoolingState = this.targetHeatingCoolingState;
        res_data.currentTemperature = this.currentTemperature;
        res_data.targetTemperature = this.targetTemperature;
        res_data.status = "ok";
        callback(error, res_data);
        this._ms170sRequest(parameters,
            function (error, responseBody) {
                if (responseBody.status == "ok") {
                    if (parameters.action != "status")
                        responseBody.currentHeatingCoolingState = 1;
                    if (parameters.action == "off") {
                        this.pollingEnabled = false;
                        responseBody.currentHeatingCoolingState = 0;
                    }
                    if (parameters.action == "boil")
                        responseBody.targetTemperature = 100;
                    if (parameters.action == "boil" || parameters.action == "heat") {
                        if (this.pollingWhenOn) {
                            this.pollingCounter = 0;
                            this.pollingEnabled = true;
                        }
                    }
                    this.updateValues(responseBody);
                }
            }.bind(this)
        );
    },

    _ms170sRequest: function (parameters, callback) {
        this.log.debug(parameters);
        error = undefined;
        if (parameters.action == "status") {
            ms170s.ms170s_run(parameters, _ms170sEmitter);
            _ms170sEmitter.on("data_ok", function (data) {
                if (data.currentHeatingCoolingState == 1 && data.targetTemperature == "none")
                    data.targetTemperature = 100; //Boil mode
                _ms170sEmitter.removeAllListeners();
                callback(error, data);
            });
        }
        if (parameters.action == "off" || parameters.action == "boil") {
            ms170s.ms170s_run(parameters, _ms170sEmitter);
            _ms170sEmitter.on("data_ok", function (data) {
                _ms170sEmitter.removeAllListeners();
                callback(error, data);
            });
        }
        if (parameters.action == "heat") {
            parameters.action = "off";
            ms170s.ms170s_run(parameters, _ms170sEmitter);
            _ms170sEmitter.on("data_ok", function (data) {
                _ms170sEmitter.removeAllListeners();
                parameters.action = "heat";
                ms170s.ms170s_run(parameters, _ms170sEmitter);
                _ms170sEmitter.on("data_ok", function (data) {
                    _ms170sEmitter.removeAllListeners();
                    callback(error, data);
                });
            });
        }
    },

    updateValues: function (responseBody) {
        this.log.debug("Device response: %s", JSON.stringify(responseBody));
        this.chService
            .getCharacteristic(Characteristic.TargetTemperature)
            .updateValue(responseBody.targetTemperature);
        this.log("CH | Updated TargetTemperature to: %s", responseBody.targetTemperature);
        this.chService
            .getCharacteristic(Characteristic.CurrentTemperature)
            .updateValue(responseBody.currentTemperature);
        this.log("CH | Updated CurrentTemperature to: %s", responseBody.currentTemperature);
        this.chService
            .getCharacteristic(Characteristic.TargetHeatingCoolingState)
            .updateValue(responseBody.targetHeatingCoolingState);
        this.log("CH | Updated TargetHeatingCoolingState to: %s", responseBody.targetHeatingCoolingState);
        this.chService
            .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
            .updateValue(responseBody.currentHeatingCoolingState);
        this.log("CH | Updated CurrentHeatingCoolingState to: %s", responseBody.currentHeatingCoolingState);
    },

    _getStatus: function (callback) {
        this.log.debug("Getting status");
        var parameters = {};
        parameters.action = "status";
        parameters.mac = this.mac;
        this.deviceRequest(parameters,
            function (error, responseBody) {
                if (error) {
                    this.log.warn("Error getting status: %s", error.message);
                    this.chService
                        .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
                        .updateValue(new Error("Polling failed"));
                    callback(error);
                } else {
                    this.updateValues(responseBody);
                    callback();
                }
            }.bind(this)
        );
    },

    setTargetHeatingCoolingState: function (value, callback) {
        var parameters = {};
        if (value == 1) {
            parameters.action = "boil";
            parameters.temperature = 100;
        } else {
            parameters.action = "off";
        }
        parameters.mac = this.mac;
        this.log.debug("CH | Setting targetHeatingCoolingState");
        this.deviceRequest(parameters,
            function (error, res_data) {
                if (res_data.status != "ok") {
                    this.log.warn("CH | Error setting targetHeatingCoolingState: %s", res_data.status);
                    callback(error);
                } else {
                    this.log("CH | Set targetHeatingCoolingState to: %s", value);
                    callback();
                }
            }.bind(this)
        );
    },

    setTargetTemperature: function (value, callback) {
        var parameters = {};
        parameters.action = "heat";
        parameters.temperature = value;
        parameters.mac = this.mac;
        this.log.debug("CH | Setting targetTemperature");
        this.deviceRequest(parameters,
            function (error, res_data) {
                if (res_data.status != "ok") {
                    this.log.warn("CH | Error setting targetTemperature: %s", res_data.status);
                    callback(error);
                } else {
                    this.log("CH | Set targetTemperature to: %s", value);
                    callback();
                }
            }.bind(this)
        );
    },

    getServices: function () {
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
            });

        this.chService
            .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
            .on("get", this._getStatus.bind(this));

        this.chService
            .getCharacteristic(Characteristic.CurrentTemperature)
            .on("get", this._getStatus.bind(this));

        var services = [this.informationService, this.chService];

        setInterval(
            function () {
                if (this.pollingEnabled && this.pollingCounter>0) {
                    this.log.debug("******Polling*****");
                    var parameters = {};
                    parameters.action = "status";
                    parameters.mac = this.mac;
                    this.deviceRequest(parameters, function () {
                        
                    });
                }
                this.pollingCounter++;
            }.bind(this),
            this.pollInterval);

        return services;
    }
};
