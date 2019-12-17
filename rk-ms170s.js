const noble = require('noble');
const EventEmitter = require('events');
var ServiceUuid = '6e400001b5a3f393e0a9e50e24dcca9e';


var DEBUG = false;

var targetTemp = {
	0: 'none',
	1: 40,
	2: 55,
	3: 70,
	4: 85,
	5: 95
};
// var states = {
//     0: 'off',
//     2: 'on'
// };
var states = {
	0: 0,
	2: 1
};
// var programs = {
//     0: 'boil',
//     1: 'heat'
// };
var programs = {
	0: 0,
	1: 0
};

class Ms170sEmitter extends EventEmitter {}

const ms170sEmitter = new Ms170sEmitter();

var auth_ok = false;
var data_recv_ok = false;
var repeat_delay=1500;



var ms170s_run = async function (parameters,_ms170sEmitter){
	if (noble.state === 'poweredOn') {
		ms170s(parameters,_ms170sEmitter);
	} else {
		noble.on('stateChange', function (state) {
			if (state === 'poweredOn') {
				ms170s(parameters,_ms170sEmitter);
			}
		});
	}
}

function ms170s(parameters,_ms170sEmitter) {
		noble.startScanning([ServiceUuid], true);        
		noble.on('discover', function (peripheral) {                 
			if (peripheral.address.toUpperCase() == parameters.mac.toUpperCase()) {
				console_log("Device Found.");                
				noble.stopScanning();
				noble.removeAllListeners('discover');
				peripheral.connect(function (err) {
					print_and_exit_on_error(err);
					console_log("Connected.");
	//Catch responses
					peripheral.on('handleNotify', function(handle, data) {
						var res_data=parse_response(handle,data,parameters);
						console_log("res_data:");
						console_log(res_data);
						if(res_data.status!=undefined){                                                            
							peripheral.disconnect();
							_ms170sEmitter.emit('data_ok',res_data);  
							return;                          
						}                                           
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
						ms170sEmitter.removeAllListeners();
						switch (parameters.action) {
							case "status":
								_writeHandle(peripheral,0x000e,Buffer.from([0x55, 0, 0x06, 0xaa]), false); 
								setTimeout(function (){
									if(!data_recv_ok)
										_writeHandle(peripheral,0x000e,Buffer.from([0x55, 0, 0x06, 0xaa]), false);                                         
								}, repeat_delay);
								break;
							case "boil":
								_writeHandle(peripheral,0x000e,Buffer.from([0x55, 0, 0x05, 0x00, 0x00, 0x00, 0x00, 0xaa]), false); 
								setTimeout(function (){
									if(!data_recv_ok)
									_writeHandle(peripheral,0x000e,Buffer.from([0x55, 0, 0x05, 0x00, 0x00, 0x00, 0x00, 0xaa]), false);                                      
								}, repeat_delay);                        
								break;
							case "off":
								_writeHandle(peripheral,0x000e,Buffer.from([0x55, 0, 0x04, 0xaa]), false); 
								setTimeout(function (){
									if(!data_recv_ok)
									_writeHandle(peripheral,0x000e,Buffer.from([0x55, 0, 0x04, 0xaa]), false);                                     
								}, repeat_delay);   
								break;
							case "heat":
								var heat_mode=getHeatMode(parameters.temperature);
								_writeHandle(peripheral,0x000e,Buffer.from([0x55, 0, 0x05, 0x01, +heat_mode, 0x00, 0x00, 0xaa]), false);                          
								break;                    
							case "boilheat":
								var heat_mode=getHeatMode(parameters.temperature);
								_writeHandle(peripheral,0x000e,Buffer.from([0x55, 2, 0x05, 0x00, +heat_mode, 0x00, 0x00, 0xaa]), false); 
								setTimeout(function (){
									if(!data_recv_ok)
									_writeHandle(peripheral,0x000e,Buffer.from([0x55, 2, 0x05, 0x00, +heat_mode, 0x00, 0x00, 0xaa]), false);                                     
								}, repeat_delay);                           
								break;   
						}
					});
					
				});
			}
		});
	//});
}



function parse_response(handle,data,parameters){
	console_log("<-- handle: 0x0"+handle.toString(16));
	console_log(data);
	var res_data={};
	if(data.length==5){
		if (data[3] == 0 && data[4] == 0xaa) {
			//console.log('Unauthorized. Hold "+" button on device and repeat.');
			res_data.status="'Unauthorized. Hold "+" button on device and repeat.'";
			return res_data;   
		}else{
			if(data[2]== 0xff){
				auth_ok = true;
				ms170sEmitter.emit('auth_ok');
				console_log("Authorized.");    
				res_data.auth="ok";
				return res_data;                           
			}
		}
		if(data[2]== 0x04||data[2]== 0x05){
			data_recv_ok = true;
			if(data[3]==1){
				res_data.status="ok";
				return res_data;                        
			}            
		}
	}
	if(data.length==13)//Status
	{
		data_recv_ok = true;
		var res_data={};
		res_data.currentHeatingCoolingState = states[data[11]];
		//res_data.targetHeatingCoolingState = programs[data[3]];
		res_data.targetHeatingCoolingState = res_data.currentHeatingCoolingState;
		res_data.targetTemperature = targetTemp[data[4]];
		res_data.currentTemperature = data[5];
		res_data.remainingTimeHours = data[8];
		res_data.remainingTimeMinutes = data[9];
		res_data.status="ok";
		return res_data;    
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

//just_print(Parameters,true);

exports.ms170s_run = ms170s_run;