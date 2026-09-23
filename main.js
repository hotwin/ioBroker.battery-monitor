'use strict';

const utils = require('@iobroker/adapter-core');

class BatteryMonitor extends utils.Adapter {
    constructor(options) {
        super({
            ...options,
            name: 'battery-monitor',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async onReady() {
        this.log.info('Battery Monitor Adapter gestartet.');
        await this.checkBatteries();
        
        // Alle 6 Stunden prüfen
        this.interval = setInterval(() => {
            this.checkBatteries();
        }, 6 * 60 * 60 * 1000);
    }

    async checkBatteries() {
        try {
            const threshold = this.config.threshold || 20;
            const lowBatteries = [];

            const states = await this.getForeignStatesAsync('*');
            const objects = await this.getForeignObjectsAsync('*', 'state');

            for (const id of Object.keys(states)) {
                const obj = objects[id];
                if (!obj || !obj.common) continue;

                const name = obj.common.name || '';
                const lowerId = id.toLowerCase();
                const lowerName = typeof name === 'string' ? name.toLowerCase() : JSON.stringify(name).toLowerCase();

                const isBatteryPercent = (lowerId.includes('battery') || lowerId.includes('batt') || lowerName.includes('batterie')) && 
                                         (lowerId.includes('percent') || lowerId.includes('level') || obj.common.unit === '%');
                
                const isLowBattBool = lowerId.includes('lowbatt') || lowerId.includes('battery_low') || lowerId.includes('low_battery');

                const state = states[id];
                if (!state || state.val === null || state.val === undefined) continue;

                let isLow = false;

                if (isBatteryPercent && typeof state.val === 'number') {
                    if (state.val <= threshold) isLow = true;
                } else if (isLowBattBool) {
                    if (state.val === true || state.val === 1) isLow = true;
                }

                if (isLow) {
                    let deviceName = name;
                    if (!deviceName || deviceName === id) {
                        const parts = id.split('.');
                        deviceName = parts.length > 2 ? parts[parts.length - 2] + ' (' + parts[parts.length - 1] + ')' : id;
                    }

                    lowBatteries.push({
                        id: id,
                        name: deviceName,
                        value: state.val,
                        unit: obj.common.unit || '%'
                    });
                }
            }

            await this.setStateAsync('lowBatteriesCount', { val: lowBatteries.length, ack: true });
            await this.setStateAsync('lowBatteriesList', { val: JSON.stringify(lowBatteries), ack: true });

            this.log.info(`Batterie-Check beendet. ${lowBatteries.length} Geräte mit schwacher Batterie gefunden.`);

        } catch (error) {
            this.log.error(`Fehler beim Überprüfen der Batterien: ${error.message}`);
        }
    }

    onUnload(callback) {
        try {
            if (this.interval) clearInterval(this.interval);
            callback();
        } catch (e) {
            callback();
        }
    }
}

if (require.main === module) {
    new BatteryMonitor();
} else {
    module.exports = exports => new BatteryMonitor(exports);
}
