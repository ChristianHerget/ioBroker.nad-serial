"use strict";

/*
 * Created with @iobroker/create-adapter v1.24.2
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");

// Load your modules here, e.g.:
const SerialPort = require('serialport');
const ReadLine   = require('@serialport/parser-readline');

class NadSerialport {
    constructor( NadSerial, handler ) {
        console.log( 'Constructor' );
        this.keyValueMap = new Map( );
        this.keyValueMap.set( 'test', '2' );
        
        this.NadSerial = NadSerial;
        this.handler = handler;

        this.listMainVariables = [
            'AutoSense',
            'AutoStandby',
            'BT.Mode',
            'BT.Source',
            'BTWorkMode',
            'Balance',
            'Bass',
            'Brightness',
            'ControlStandby',
            'Dimmer',
            'Display',
            'Filters',
            'IR.Channel',
            'IR.LearningDevice',
            'Model',
            'Mute',
            'Power',
            'PreoutSub',
            'Source',
            'Sources',
            'SpeakerA',
            'SpeakerB',
            'ToneDefeat',
            'Treble',
            'Volume',
            'VolumeDisplayMode',
        ];
    }

    list( ) {
        this.serialPort.list( ).then(
            ports => {
                ports.forEach(port => {
                    console.log(`${port.comName}\t${port.pnpId || ''}\t${port.manufacturer || ''}`)
                })
            },
            err => {
                console.error('Error listing ports', err)
            }
        );
    }

    connect( dev = '' ) {
        console.log( 'Connect Device: ' + dev );

        this.port = new SerialPort( '/dev/ttyUSB0', {
            baudRate: 115200, // Can be static as this is the default for all NAD devices
            autoOpen: false
        });

        this.port.parent = this;

        // Open errors will be emitted as an error event
        this.port.on( 'error', function( err ) {
            console.log( 'Serial Port Error: ', err.message );
        } );

        this.port.on( 'open', this.opened );

        this.port.open( );
    }

    getSources( num = 0 ) {
        const list = [
            'ADCSampleRate',
            'AnalogGain',
            'Enabled',
            'Input',
            'Name',
            'Slot',
            'VolumeControl',
            'VolumeFixed',
        ];
        for( var i = 1 ; i <= num ; i++ ) {
            for( var variable of list )
            this.sendCommand( 'Source' + i , variable );
        }
    }

    parseNadLine( line ) {
        // console.log( 'Received: ', line );

        const splitString  = line.split( '=' );
        const command      = splitString[0];
        var   value        = splitString[1];
        
        // Convert Yes/No On/Off to true/false
        switch( value ) {
            case 'On':
            case 'Yes':
                value = true;
                break;
            case 'Off':
            case 'No':
                value = false;
                break;
        }
        
        this.parent.parent.handler( this.parent.parent.NadSerial, command, value );
    }

    opened( ) {
        console.log( 'Serial Port Opened' );
        this.readLineParser = new ReadLine( { delimiter: '\r' } );
        this.parser = this.pipe( this.readLineParser );
        this.parser.parent = this;
        this.parser.on( 'data', this.parent.parseNadLine );
        this.parent.NadSerial.log.info( 'Serial Port Opened' );
    }

    sendCommand( command, operator = '?', value = '' ) {
        const message = command + operator + value;
        this.port.write( '\n' + message + '\r', function( err ) {
            if( err ) {
                return console.log( 'Error on write: ', err.message )
            }
            console.log( 'Message "' + message + '" written' );
        } );
    }
    
    sendAllMainCommands( ) {
        for( var variable of this.listMainVariables ) {
            this.sendCommand( 'Main.'.concat( variable ) );
        }
    }
}

class NadSerial extends utils.Adapter {

    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: "nad-serial",
        });
        this.on( "ready", this.onReady.bind( this ) );
        this.on( "objectChange", this.onObjectChange.bind( this) );
        this.on( "stateChange", this.onStateChange.bind( this ) );
        // this.on("message", this.onMessage.bind(this));
        this.on( "unload", this.onUnload.bind( this ) );
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Initialize your adapter here

        // The adapters config (in the instance object everything under the attribute "native") is accessible via
        // this.config:
        // this.log.info("config option1: " + this.config.option1);
        // this.log.info("config option2: " + this.config.option2);
        // this.log.info("config option2: " + this.config);

        /*
        For every state in the system there has to be also an object of type state
        Here a simple template for a boolean variable named "testVariable"
        Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
        */
        this.commandReceivedHandler = { };
        this.stateChangeTrigger = { };

        this.setObject( "Main.Power", {
            type: "state",
            common: {
                name:   "Power",
                type:   "boolean",
                states: { true: "On", false: "Off" },
                role:   "switch.power",
                read:   true,
                write:  true,
                
            },
            native: {}
        });        
        
        this.stateChangeTrigger["Main.Power"] = ( value ) => { this.nadSerialport.sendCommand( "Main.Power", "=", value === true ? "On" : "Off" ); };
        
        this.setObject( "Main.Power.On", {
            type: "state",
            common: {
                name:   "Power On",
                type:   "boolean",
                role:   "button",
                read:   false,
                write:  true,
            },
            native: {}
        });
        
        this.stateChangeTrigger["Main.Power.On"] = ( value ) => { this.nadSerialport.sendCommand( "Main.Power", "=", "On" ); };
        
        await this.setObjectAsync( "Main", {
            type: "device",
            common: {
                name:   "Main",
            },
            native: { },
        });
            
        await this.setObjectAsync( "Main.Power.Off", {
            type: "state",
            common: {
                name:   "Power Off",
                type:   "boolean",
                role:   "button",
                read:   false,
                write:  true,
            },
            native: {}
        });
        
        this.stateChangeTrigger["Main.Power.Off"] = ( value ) => { this.nadSerialport.sendCommand( "Main.Power", "=", "Off" ); };
        
        await this.setObjectAsync("Main.Model", {
            type: "state",
            common: {
                name:   "Model Name",
                type:   "string",
                role:   "info.name",
                read:   true,
                write:  false,
            },
            native: {},
        });

        await this.setObjectAsync( "Main.Mute", {
            type: "state",
            common: {
                name:   "Mute",
                type:   "boolean",
                role:   "media.mute",
                read:   true,
                write:  true,
            },
            native: {},
        });
        
        this.stateChangeTrigger["Main.Mute"] = ( value ) => { this.nadSerialport.sendCommand( "Main.Mute", "=", value === true ? "On" : "Off" ); };

        await this.setObjectAsync( "Main.Volume", {
            type: "state",
            common: {
                name: "Main.Volume",
                type: "number",
                max:  12,
                min:  -80,
                step: 0.5,
                unit: "dB",
                role: "indicator",
                read: true,
                write: true,
            },
            native: {},
        });
        
        this.stateChangeTrigger["Main.Volume"] = ( value ) => { this.nadSerialport.sendCommand( "Main.Volume", "=", value ) };

        await this.setObjectAsync( "Main.Sources", {
            type: "state",
            common: {
                name:   "Sources",
                desc:   "Number of sources",
                type:   "number",
                role:   "indicator",
                read:   true,
                write:  false,
            },
            native: {},
        });
        
        this.commandReceivedHandler["Main.Sources"] = ( ( value ) => {
            this.setObject( "Source", {
                type: "device",
                common: {
                    name:   "Source",
                },
                native: { },
            },
            async ( ) => {
                var i;
                for( i = 1 ; i <= value ; i++ ) {
                    await this.setObject( "Source." + i, {
                        type: "channel",
                        common: {
                            name:   i,
                        },
                        native: { },
                    });
                    
                    await this.setObject( "Source." + i + ".Name" , {
                        type: "state",
                        common: {
                            name:   "Name",
                            desc:   "Name of the source",
                            type:   "string",
                            role:   "info.name",
                            read:   true,
                            write:  false,
                        },
                        native: { },
                    },
                    );
                    
                    await this.nadSerialport.sendCommand( "Source" + i + ".Name" );
                    
                    await this.setObject( "Source." + i + ".Enabled" , {
                        type: "state",
                        common: {
                            name:   "Name",
                            desc:   "Name of the source",
                            type:   "boolean",
                            states: { true: "Yes", false: "No" },
                            role:   "switch.enable",
                            read:   true,
                            write:  false,
                        },
                        native: { },
                    },
                    );
                    
                    await this.nadSerialport.sendCommand( "Source" + i + ".Enabled" );
                }
            } );
        } );

        // this.log.info( "test2" + this );

        // in this template all states changes inside the adapters namespace are subscribed
        this.subscribeStates( "*" );

        // await this.setStateAsync("testVariable", { val: true, ack: true });
        
        // await this.setStateAsync("Main.Model", { val: 'C368', ack: true });
        
        var self = this;
        this.nadSerialport = new NadSerialport( this, this.nadCommandHandler );
        this.nadSerialport.connect( '/dev/ttyUSB0' );
        
        await this.nadSerialport.sendCommand( "Main.Power" );
        await this.nadSerialport.sendCommand( "Main.Model" );
        await this.nadSerialport.sendCommand( "Main.Mute" );
        await this.nadSerialport.sendCommand( "Main.Volume" );

        await this.nadSerialport.sendCommand( "Main.Sources" );
    }
    
    nadCommandHandler( NadSerial, command, value ) {
        
        const objectName = NadSerial.namespace + "." + command;

        NadSerial.log.info( 'Received: ' + command + ' Value: ' + value );

        if( typeof NadSerial.commandReceivedHandler[command] === "function" ) {
            NadSerial.commandReceivedHandler[command]( value );
        } else if( command.match( /Source(\d+)\.(\w+)/ ) ) {
            const result = command.match( /Source(\d+)\.(\w+)/ );
            NadSerial.setState( "Source." + result[1] + "." + result[2], { val: value, ack: true } );
        } else {
            NadSerial.setState( command, { val: value, ack: true } );
        }
    }
    
    onMainMuteChanged( test ) {
        this.log.info( "TEST" + test );
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            this.log.info("cleaned everything up...");
            callback();
        } catch (e) {
            callback();
        }
    }

    /**
     * Is called if a subscribed object changes
     * @param {string} id
     * @param {ioBroker.Object | null | undefined} obj
     */
    onObjectChange( id, obj ) {
        if( obj ) {
            // The object was changed
            this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
        } else {
            // The object was deleted
            this.log.info(`object ${id} deleted`);
        }
    }

    /**
     * Is called if a subscribed state changes
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    onStateChange( id, state ) {
        if( state )
        {
            // The state was changed
            this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
            
            if( state.ack ) {
                return;
            }

            const localId = id.substr( this.namespace.length + 1 );

            if( typeof this.stateChangeTrigger[localId] === "function" ) {
                this.stateChangeTrigger[localId]( state.val );
            } else {
                this.log.error( "no handler for state id " + localId );
            }
        } else {
            // The state was deleted
            this.log.info(`state ${id} deleted`);
        }
    }

    // /**
    //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
    //  * Using this method requires "common.message" property to be set to true in io-package.json
    //  * @param {ioBroker.Message} obj
    //  */
    // onMessage(obj) {
    // 	if (typeof obj === "object" && obj.message) {
    // 		if (obj.command === "send") {
    // 			// e.g. send email or pushover or whatever
    // 			this.log.info("send command");

    // 			// Send response in callback if required
    // 			if (obj.callback) this.sendTo(obj.from, obj.command, "Message received", obj.callback);
    // 		}
    // 	}
    // }

}

// @ts-ignore parent is a valid property on module
if (module.parent) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new NadSerial(options);
} else {
    // otherwise start the instance directly
    new NadSerial();
}