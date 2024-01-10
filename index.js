const miio = require('miio');
let Service, Characteristic;
let devices = [];

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory('homebridge-mi-air-purifier-2H', 'MiAirPurifier', MiAirPurifier);
}

function MiAirPurifier(log, config) {
    this.log = log;
    this.ip = config.ip;
    this.token = config.token;
    this.name = config.name || 'Air Purifier';
    this.showAirQuality = config.showAirQuality || false;
    this.showTemperature = config.showTemperature || false;
    this.showHumidity = config.showHumidity || false;
    this.showLED = config.showLED || false;
    this.showBuzzer = config.showBuzzer || false;
    this.showFilterLevel = config.showFilterLevel || false;

    this.nameAirQuality = config.nameAirQuality || 'Air Quality';
    this.nameTemperature = config.nameTemperature || 'Temperature';
    this.nameHumidity = config.nameHumidity || 'Humidity';

    this.device = null;
    this.mode = null;
    this.temperature = null;
    this.humidity = null;
    this.aqi = null;

    this.levels = [
        [200, Characteristic.AirQuality.POOR],
        [150, Characteristic.AirQuality.INFERIOR],
        [100, Characteristic.AirQuality.FAIR],
        [50, Characteristic.AirQuality.GOOD],
        [0, Characteristic.AirQuality.EXCELLENT],
    ];

    this.services = [];

    if (!this.ip) {
        throw new Error('You must provide the IP address of the Air Purifier.');
    }

    if (!this.token) {
        throw new Error('You must provide token of the Air Purifier.');
    }

    this.service = new Service.AirPurifier(this.name);

    this.service
        .getCharacteristic(Characteristic.Active)
        .onGet(this.getActiveState.bind(this))
        .onSet(this.setActiveState.bind(this));

    this.service
        .getCharacteristic(Characteristic.CurrentAirPurifierState)
        .onGet(this.getCurrentAirPurifierState.bind(this));

    this.service
        .getCharacteristic(Characteristic.TargetAirPurifierState)
        .onGet(this.getTargetAirPurifierState.bind(this))
        .onSet(this.setTargetAirPurifierState.bind(this));

    this.service
        .getCharacteristic(Characteristic.LockPhysicalControls)
        .onGet(this.getLockPhysicalControls.bind(this))
        .onSet(this.setLockPhysicalControls.bind(this));

    this.service
        .getCharacteristic(Characteristic.RotationSpeed)
        .onGet(this.getRotationSpeed.bind(this))
        .onSet(this.setRotationSpeed.bind(this));

    this.serviceInfo = new Service.AccessoryInformation();

    this.serviceInfo
        .setCharacteristic(Characteristic.Manufacturer, 'Xiaomi')
        .setCharacteristic(Characteristic.Model, 'Air Purifier');

    this.services.push(this.service);
    this.services.push(this.serviceInfo);

    if (this.showAirQuality) {
        this.airQualitySensorService = new Service.AirQualitySensor(this.nameAirQuality);

        this.airQualitySensorService
            .getCharacteristic(Characteristic.AirQuality)
            .onGet(this.getAirQuality.bind(this));

        this.airQualitySensorService
            .getCharacteristic(Characteristic.PM2_5Density)
            .onGet(this.getPM25.bind(this));

        this.services.push(this.airQualitySensorService);
    }

    if (this.showTemperature) {
        this.temperatureSensorService = new Service.TemperatureSensor(this.nameTemperature);

        this.temperatureSensorService
            .getCharacteristic(Characteristic.CurrentTemperature)
            .onGet(this.getTemperature.bind(this));

        this.services.push(this.temperatureSensorService);
    }

    if (this.showHumidity) {
        this.humiditySensorService = new Service.HumiditySensor(this.nameHumidity);

        this.humiditySensorService
            .getCharacteristic(Characteristic.CurrentRelativeHumidity)
            .onGet(this.getHumidity.bind(this));

        this.services.push(this.humiditySensorService);
    }

    if (this.showLED) {
        this.lightBulbService = new Service.Lightbulb(this.name + ' LED');

        this.lightBulbService
            .getCharacteristic(Characteristic.On)
            .onGet(this.getLED.bind(this))
            .onSet(this.setLED.bind(this));

        this.services.push(this.lightBulbService);
    }

    if (this.showBuzzer) {
        this.switchService = new Service.Switch(this.name + ' Buzzer');

        this.switchService
            .getCharacteristic(Characteristic.On)
            .onGet(this.getBuzzer.bind(this))
            .onSet(this.setBuzzer.bind(this));

        this.services.push(this.switchService);
    }

    if (this.showFilterLevel) {
        this.filterService = new Service.FilterMaintenance;

        this.filterService
            .getCharacteristic(Characteristic.FilterChangeIndication)
            .onGet(this.getFilterChangeIndication.bind(this));

        this.filterService
            .getCharacteristic(Characteristic.FilterLifeLevel)
            .onGet(this.getFilterLifeLevel.bind(this));

        this.services.push(this.filterService);
    }

    this.discover();
}

MiAirPurifier.prototype = {
    discover: function() {
        var log = this.log;
        var that = this;
        

        if (!this.discoverPromise) {
            this.discoverPromise = new Promise((resolve, reject) => {
                miio.device({
                    address: this.ip,
                    token: this.token
                })
                .then(device => {
                    if (device.matches('type:air-purifier')) {
                        that.device = device;
                        console.log('Discovered Mi Air Purifier (%s) at %s', device.miioModel, this.ip);
    
                        log.debug('Model       : ' + device.miioModel);
                        log.debug('Power       : ' + device.property('power'));
                        log.debug('Mode        : ' + device.property('mode'));
                        log.debug('Temperature : ' + device.property('temperature'));
                        log.debug('Humidity    : ' + device.property('humidity'));
                        log.debug('Air Quality : ' + device.property('aqi'));
                        log.debug('LED         : ' + device.property('led'));
                        log.debug('Filter Level: ' + device.property('filterLifeRemaining')); 
    
                        // Listen to mode change event
                        device.on('modeChanged', mode => {
                            that.updateActiveState(mode);
                            that.updateTargetAirPurifierState(mode);
                            that.updateCurrentAirPurifierState(mode);
                        });
    
                        // Listen to air quality change event
                        if (that.showAirQuality) {
                            device.on('pm2.5Changed', value => that.updateAirQuality(value));
                        }
    
                        // Listen to temperature change event
                        if (that.showTemperature) {
                            device.on('temperatureChanged', value => that.updateTemperature(parseFloat(value)));
                        }
    
                        // Listen to humidity change event
                        if (that.showHumidity) {
                            device.on('relativeHumidityChanged', value => that.updateHumidity(value));
                        }

                        resolve(device);
                    } else {
                        console.log('Device discovered at %s is not a Mi Air Purifier', this.ip);
                    }
                })
                .catch(err => {
                    console.log(err)
                    console.log('Failed to discover Mi Air Purifier at %s', this.ip);
                    console.log('Will retry after 30 seconds');
                
                    //Retry after 30 seconds
                    setTimeout(() => {
                        this.discover().then(resolve).catch(reject);
                    }, 30000);
                
                    //Device not found => reject promise
                    reject(err);
                });
            })
        }

        return this.discoverPromise;
    },

    ensureDeviceDiscovered: function() {
        if (this.device) {
            return Promise.resolve(this.device);
        } else if (this.discoverPromise) {
            return this.discoverPromise
                .then(device => {
                    this.device = device;
                    return device;
                })
                .catch(err => {
                    this.log.error('Error discovering device:', err);
                    throw err; 
                });
        } else {
            return this.discover();
        }
    },


    getActiveState: async function() {
        await this.ensureDeviceDiscovered();

        const state = (this.mode != 'idle') ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE;
        this.log.debug('getActiveState: Mode -> %s', this.mode);
        this.log.debug('getActiveState: State -> %s', state);

        return state;

    },

    setActiveState: async function(state) {
        await this.ensureDeviceDiscovered();
        this.log.debug('setActiveState: %s', state);


        try {
            await this.device.setPower(state);
        } catch (error) {
            throw new Error("Error setting active state: ", error);
        }
    }, 

    updateActiveState: function(mode) {
        const state = (mode != 'idle') ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE;
        this.mode = mode;

        this.log.debug('updateActiveState: Mode -> %s', mode);
        this.log.debug('updateActiveState: State -> %s', state);

        this.service.getCharacteristic(Characteristic.Active).updateValue(state);
    },

    getCurrentAirPurifierState: async function() {
        await this.ensureDeviceDiscovered();

        const state = (this.mode == 'idle') ? Characteristic.CurrentAirPurifierState.INACTIVE : Characteristic.CurrentAirPurifierState.PURIFYING_AIR;
        this.log.debug('getCurrentAirPurifierState: Mode -> %s', this.mode);
        this.log.debug('getCurrentAirPurifierState: State -> %s', state);
        
        return state;
    },

    updateCurrentAirPurifierState: function(mode) {
        const state = (mode == 'idle') ? Characteristic.CurrentAirPurifierState.INACTIVE : Characteristic.CurrentAirPurifierState.PURIFYING_AIR;
        this.mode = mode;

        this.log.debug('updateCurrentAirPurifierState: Mode ->  %s', mode);
        this.log.debug('updateCurrentAirPurifierState: State ->  %s', state);
        this.service.getCharacteristic(Characteristic.CurrentAirPurifierState).updateValue(state);
    },

    getTargetAirPurifierState: async function() {
        await this.ensureDeviceDiscovered();

        const state = (this.mode != 'favorite') ? Characteristic.TargetAirPurifierState.AUTO : Characteristic.TargetAirPurifierState.MANUAL;
        this.log.debug('getTargetAirPurifierState: Mode -> %s', this.mode);
        this.log.debug('getTargetAirPurifierState: State -> %s', state);
        return state;
    },

    setTargetAirPurifierState: async function(state) {
        await this.ensureDeviceDiscovered();

        const mode = (state) ? 'auto' : 'favorite';
        this.mode = mode;

        this.log.debug('setTargetAirPurifierState: %s', mode);

        try {
            await this.device.setMode(mode);
        } catch (error) {
            throw new Error("Error setting target air purifier state: ", error);
        }
    },

    updateTargetAirPurifierState: function(mode) {
        const state = (mode != 'favorite') ? Characteristic.TargetAirPurifierState.AUTO : Characteristic.TargetAirPurifierState.MANUAL;
        this.mode = mode;

        this.log.debug('updateTargetAirPurifierState: Mode -> %s', mode);
        this.log.debug('updateTargetAirPurifierState: State -> %s', state);

        this.service.getCharacteristic(Characteristic.TargetAirPurifierState).updateValue(state);
    },

    getLockPhysicalControls: async function() {
        await this.ensureDeviceDiscovered();

        try {
            lock_state = await this.device.call('get_prop', ['child_lock']);
            const state = (lock_state[0] === 'on') ? Characteristic.LockPhysicalControls.CONTROL_LOCK_ENABLED : Characteristic.LockPhysicalControls.CONTROL_LOCK_DISABLED;
            this.log.debug('getLockPhysicalControls: %s', state);

            return state;
        } catch (error) {
            
            throw new Error("Error getting physical controls state: ", error);
        }
    },

    setLockPhysicalControls: async function(state) {
        await this.ensureDeviceDiscovered();

        this.log.debug('setLockPhysicalControls: %s', state);

        try {
            set_lock_result = await this.device.call('set_child_lock', [(state) ? 'on' : 'off']);
            
            if (set_lock_result[0] != 'ok') { throw new Error("Air Purifier responded with fail message!"); }

        } catch (error) {

            throw new Error("Error setting physical control lock: ", error);
        }
    },


    getRotationSpeed: async function() {
        await this.ensureDeviceDiscovered();

        try {
            level = await this.device.favoriteLevel();
            const speed = Math.ceil(level * 6.25);
            this.log.debug('getRotationSpeed: %s', speed);

            return speed;

        } catch (error) {
            
            throw new Error("Error getting rotation speed: ", error);
        }
    },

    setRotationSpeed: async function(speed) {
        await this.ensureDeviceDiscovered();

        //Override current mode to manual mode
        if (this.mode != 'favorite') {

            try {
                await this.device.setMode('favorite');
            } catch (error) {
                throw new Error("Error overriding mode: ", error);
            }
        }

        const level = Math.ceil(speed / 6.25);
        this.log.debug('setRotationSpeed: %s', level);

        try {
            await this.device.setFavoriteLevel(level);
        } catch (error) {
            throw new Error("Error setting rotation speed: ", error);
        }
    },

    getAirQuality: async function() {
        await this.ensureDeviceDiscovered();

        this.log.debug('getAirQuality: %s', this.aqi);

        for (let qualityLevel of this.levels) {
            if (this.aqi >= qualityLevel[0]) {
                return qualityLevel[1];
            }
        }
    },

    updateAirQuality: async function(value) {
        await this.ensureDeviceDiscovered();

        this.aqi = value;
        this.log.debug('updateAirQuality: %s', value);

        for (let qualityLevel of this.levels) {
            if (value >= qualityLevel[0]) {
                this.airQualitySensorService.getCharacteristic(Characteristic.AirQuality).updateValue(qualityLevel[1]);
                return;
            }
        }
    },

    getPM25: async function() {
        await this.ensureDeviceDiscovered();

        this.log.debug('getPM25: %s', this.aqi);

        return this.aqi;
    },

    getTemperature: async function() {
        await this.ensureDeviceDiscovered();

        this.log.debug('getTemperature: %s', this.temperature);

        return this.temperature;
    },

    updateTemperature: async function(value) {
        await this.ensureDeviceDiscovered();

        this.temperature = value;
        this.log.debug('updateTemperature: %s', value);

        this.temperatureSensorService.getCharacteristic(Characteristic.CurrentTemperature).updateValue(value);
    },

    getHumidity: async function() {
        await this.ensureDeviceDiscovered();

        this.log.debug('getHumidity: %s', this.humidity);

        return this.humidity;
    },

    updateHumidity: async function(value) {
        await this.ensureDeviceDiscovered();

        this.humidity = value;
        this.log.debug('updateHumidity: %s', value);

        this.humiditySensorService.getCharacteristic(Characteristic.CurrentRelativeHumidity).updateValue(value);
    },

    getLED: async function() {
        await this.ensureDeviceDiscovered();

        try {
            const state = await this.device.led();
            this.log.debug('getLED: %s', state);
            
            return state;
        } catch (error) {
            throw new Error("Error getting LED state: ", error);   
        }
    },

    setLED: async function(state) {
        await this.ensureDeviceDiscovered();

        this.log.debug('setLED: %s', state);

        try {
            await this.device.led(state);
        } catch (error) {
            throw new Error("Error setting LED state: ", error);
        }
    },

    getBuzzer: async function() {
        await this.ensureDeviceDiscovered();

        try {
            const state = await this.device.buzzer();
            this.log.debug('getBuzzer: %s', state);

            return state;
        } catch (error) {
            throw new Error("Error getting buzzer state: ", error);
        }
    },

    setBuzzer: async function(state) {
        await this.ensureDeviceDiscovered();

        this.log.debug('setBuzzer: %s', state);

        try {
            
            await this.device.buzzer(state);
        } catch (error) {
            throw new Error("Error setting buzzer state:", state);
        }
    },

    getFilterLifeLevel: async function() {
        await this.ensureDeviceDiscovered();

        try {
            filterLevel = await this.device.property('filterLifeRemaining');
            this.log.debug('getFilterLifeLevel: %s', filterLevel);

            return filterLevel;
        } catch (error) {
            throw new Error("Error getting filter life level: ", error);
        }
    },

    getFilterChangeIndication: async function() {
        await this.ensureDeviceDiscovered();
        
        try {
            filterLevel = await this.getFilterLifeLevel();

            return (filterLevel >= 10) ? Characteristic.FilterChangeIndication.FILTER_OK : Characteristic.FilterChangeIndication.CHANGE_FILTER;
        } catch (error) {
            throw new Error("Error getting filter change indication: ", error)
        }


    },

    identify: async function() { //HomeKit 'identification' procedure
        try {
            await this.setBuzzer(false);
            await this.setBuzzer(true);

        } catch (error) {
            this.log.debug("Error running identification procedure!");
        }
    },

    getServices: function() {
        return this.services;
    }
};
