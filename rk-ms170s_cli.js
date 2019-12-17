const noble = require('noble');
const EventEmitter = require('events');
var ServiceUuid = '6e400001b5a3f393e0a9e50e24dcca9e';
var argv = require('minimist')(process.argv.slice(2));


if(argv.h){
console.log(`HuUsage: node rm-ms170s.js <Parameters> [Options]

    Parameters: -m <ketttle MAC Address>
                -a <Action status|boil|heat|boilheat|off>
    Options:    -t Temperature
                -s Simple On/Off
                -v Verbose
                -h Help`);
    process.exit(0);
}


var DEBUG = false;
if(argv.v)
    DEBUG = true;
var MAC = argv.m;
var Parameters ={};
Parameters.action=argv.a;
Parameters.temperature = argv.t;
var targetTemp = {
    0: 'none',
    1: 40,
    2: 55,
    3: 70,
    4: 85,
    5: 95
};
var states = {
    0: 'off',
    2: 'on'
};
var programs = {
    0: 'boil',
    1: 'heat'
};
var simple_out = argv.s;

class Ms170sEmitter extends EventEmitter {}

const ms170sEmitter = new Ms170sEmitter();

if (noble.state === 'poweredOn') {
    ms170s(Parameters);
} else {
    noble.on('stateChange', function (state) {
        if (state === 'poweredOn') {
            ms170s(Parameters);
        }
    });
}

var auth_ok = false;
var data_recv_ok = false;
var repeat_delay=1500;
//var retry_count = 2;

function ms170s(parameters) {
    noble.startScanning([ServiceUuid], true);
    noble.on('discover', function (peripheral) {                
        if (peripheral.address.toUpperCase() == MAC.toUpperCase()) {
            console_log("Device Found.");
            noble.stopScanning();
            noble.removeAllListeners('discover');
            peripheral.connect(function (err) {
                print_and_exit_on_error(err);
                console_log("Connected.");
//Catch responses
                peripheral.on('handleNotify', function(handle, data) {
                    parse_response(peripheral,handle,data,parameters);
                    // var res_data=parse_response(peripheral,handle,data,false);
                    // return res_data;
                });
//Write requests
                _writeHandle(peripheral,0x000c,Buffer.from([0x01, 0x00]), false);                
                _writeHandle(peripheral,0x000e,Buffer.from([0x55, 0, 0xff, 0xb5, 0x4c, 0x75, 0xb1, 0xb4, 0x0c, 0x88, 0xef, 0xaa]), false);
                setTimeout(function (){
                    if(!auth_ok){
                        _writeHandle(peripheral,0x000c,Buffer.from([0x01, 0x00]), false);                
                        _writeHandle(peripheral,0x000e,Buffer.from([0x55, 0, 0xff, 0xb5, 0x4c, 0x75, 0xb1, 0xb4, 0x0c, 0x88, 0xef, 0xaa]), false);
                        setTimeout(function (){
                            if(!auth_ok){
                                _writeHandle(peripheral,0x000c,Buffer.from([0x01, 0x00]), false);                
                                _writeHandle(peripheral,0x000e,Buffer.from([0x55, 0, 0xff, 0xb5, 0x4c, 0x75, 0xb1, 0xb4, 0x0c, 0x88, 0xef, 0xaa]), false);
                            }
                        }, repeat_delay);
                    }
                }, repeat_delay);
                ms170sEmitter.on('auth_ok', () => {
                    switch (parameters.action) {
                        case "status":
                            _writeHandle(peripheral,0x000e,Buffer.from([0x55, 0, 0x06, 0xaa]), false); 
                            setTimeout(function (){
                                if(!data_recv_ok)
                                    _writeHandle(peripheral,0x000e,Buffer.from([0x55, 0, 0x06, 0xaa]), false); 
                                    setTimeout(function (){
                                        if(!data_recv_ok)
                                            _writeHandle(peripheral,0x000e,Buffer.from([0x55, 0, 0x06, 0xaa]), false); 
                                    }, repeat_delay);
                            }, repeat_delay);
                            break;
                        case "boil":
                            _writeHandle(peripheral,0x000e,Buffer.from([0x55, 0, 0x05, 0x00, 0x00, 0x00, 0x00, 0xaa]), false); 
                            setTimeout(function (){
                                if(!data_recv_ok)
                                _writeHandle(peripheral,0x000e,Buffer.from([0x55, 0, 0x05, 0x00, 0x00, 0x00, 0x00, 0xaa]), false); 
                                setTimeout(function (){
                                    if(!data_recv_ok)
                                    _writeHandle(peripheral,0x000e,Buffer.from([0x55, 0, 0x05, 0x00, 0x00, 0x00, 0x00, 0xaa]), false); 
                                }, repeat_delay);  
                            }, repeat_delay);                        
                            break;
                        case "off":
                            _writeHandle(peripheral,0x000e,Buffer.from([0x55, 0, 0x04, 0xaa]), false); 
                            setTimeout(function (){
                                if(!data_recv_ok)
                                _writeHandle(peripheral,0x000e,Buffer.from([0x55, 0, 0x04, 0xaa]), false); 
                                setTimeout(function (){
                                    if(!data_recv_ok)
                                    _writeHandle(peripheral,0x000e,Buffer.from([0x55, 0, 0x04, 0xaa]), false); 
                                }, repeat_delay); 
                            }, repeat_delay);   
                            break;
                        case "heat":
                            var heat_mode=getHeatMode(parameters.temperature);
                            _writeHandle(peripheral,0x000e,Buffer.from([0x55, 0, 0x04, 0xaa]), false);                         
                            setTimeout(function (){
                                _writeHandle(peripheral,0x000e,Buffer.from([0x55, 0, 0x05, 0x01, +heat_mode, 0x00, 0x00, 0xaa]), false); 
                            }, 500);                            
                            break;                    
                        case "boilheat":
                            var heat_mode=getHeatMode(parameters.temperature);
                            _writeHandle(peripheral,0x000e,Buffer.from([0x55, 2, 0x05, 0x00, +heat_mode, 0x00, 0x00, 0xaa]), false); 
                            setTimeout(function (){
                                if(!data_recv_ok)
                                _writeHandle(peripheral,0x000e,Buffer.from([0x55, 2, 0x05, 0x00, +heat_mode, 0x00, 0x00, 0xaa]), false); 
                                setTimeout(function (){
                                    if(!data_recv_ok)
                                    _writeHandle(peripheral,0x000e,Buffer.from([0x55, 2, 0x05, 0x00, +heat_mode, 0x00, 0x00, 0xaa]), false); 
                                }, repeat_delay); 
                            }, repeat_delay);                           
                            break;   
                    }
                });
                
            });
        }
    });
}



function parse_response(peripheral,handle,data,parameters){
    console_log("<-- handle: 0x0"+handle.toString(16));
    console_log(data);
    var res_data={};
    if(data.length==5){
        if (data[3] == 0 && data[4] == 0xaa) {
            console.log('Unauthorized. Hold "+" button on device and repeat.');
            process.exit(1);
        }else{
            if(data[2]== 0xff){
                auth_ok = true;
                ms170sEmitter.emit('auth_ok');
                console_log("Authorized.");                                
            }
        }
        if(data[2]== 0x05){
            data_sent_ok = true;
            if(data[3]==1){
                console_log("Boil/Heat:");
                console.log("ok");
            }
            peripheral.disconnect();
            process.exit(0);
        }
        if(data[2]== 0x04){
            data_sent_ok = true;
            if(data[3]==1){
                console_log("Off:");
                console.log("ok");
            }
            if(parameters.action!="heat" && parameters.action!="boilheat"){
                peripheral.disconnect();
                process.exit(0);
            }
        }
    }
    if(data.length==13)//Status
    {
        var res_data={};
        res_data.CurrentHeatingCoolingState = states[data[11]];
        if(!simple_out){
            res_data.TargetHeatingCoolingState = programs[data[3]];
            res_data.TargetTemperature = targetTemp[data[4]];
            res_data.CurrentTemperature = data[5];
            res_data.remainingTimeHours = data[8];
            res_data.remainingTimeMinutes = data[9];
        }
        console.log(res_data);
        peripheral.disconnect();
        process.exit(0);
    }
}

function getHeatMode(temperature){
    if(temperature<=55){
        return 1;
    }
    if(temperature>=55&&temperature<70){
        return 2;
    }
    if(temperature>=70&&temperature<85){
        return 3;
    }
    if(temperature>=85&&temperature<95){
        return 4;
    }
    if(temperature>=95){
        return 5;
    }
}


function console_log(msg){
    if(DEBUG){
        console.log(msg);
    }
}

function print_and_exit_on_error(err){
    if (err){ 
        console.error(err);
        process.exit(2);
    }
}

function _writeHandle(peripheral,handle,data,withoutResponse){
    console_log("---> send data:")
    console_log(data);
    peripheral.writeHandle(handle, data, withoutResponse, function (err) { 
            print_and_exit_on_error(err);
    });
}

exports.ms170s = ms170s;