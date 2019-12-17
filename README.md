# homebridge-remond-ms170s

#### Homebridge plugin to control a Redmond RK-MS170S Kettle

## Installation

1. Install [homebridge](https://github.com/nfarina/homebridge#installation-details)
2. Install this plugin: `npm install -g https://github.com/guinmoon/homebridge-remond-ms170s`
3. Update your `config.json` file (See below).

## Configuration example

```json
"accessories": [
    {
      "accessory": "ms170s",
      "name": "Kettle",
      "mac": "C8:54:A9:29:1B:7F",
      "chMin": 40,
      "chMax": 100,
      "minStep": 5
    }
]
```

### Structure

| Key | Description |
| --- | --- |
| `accessory` | Must be `ms170s` |
| `name` | Name to appear in the Home app |
| `temperatureDisplayUnits` _(optional)_ | Whether you want °C (`0`) or °F (`1`) as your units (`0` is default) |
| `maxTemp` _(optional)_ | Upper bound for the temperature selector in the Home app (`100` is default) |
| `minTemp` _(optional)_ | Lower bound for the temperature selector in the Home app (`40` is default) |
| `model` _(optional)_ | Appears under "Model" for your accessory in the Home app |
| `serial` _(optional)_ | Appears under "Serial" for your accessory in the Home app |
| `manufacturer` _(optional)_ | Appears under "Manufacturer" for your accessory in the Home app |
