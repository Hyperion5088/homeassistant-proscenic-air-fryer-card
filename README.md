# Proscenic Air Fryer Card

![Proscenic Air Fryer Card logo](brand/logo.png)

Local Lovelace card for the [`Proscenic Air Fryer`](https://github.com/Hyperion5088/homeassistant-proscenic-air-fryer) Home Assistant integration.

Status: beta. This card is designed around the tested Proscenic T21 entity set and may need small adjustments for other Proscenic/Tuya air fryer models.

## Installation

### HACS

1. Install the companion integration first.
2. Add this repository to HACS as a Dashboard resource.
3. Install `Proscenic Air Fryer Card`.
4. Refresh the browser after HACS adds the dashboard resource.

The card is published through versioned releases so HACS can show a release version instead of a branch commit.

HACS serves the card entrypoint from:

```text
/hacsfiles/homeassistant-proscenic-air-fryer-card/homeassistant-proscenic-air-fryer-card.js
```

The custom card type is:

```yaml
type: custom:proscenic-air-fryer-card
```

## Example

```yaml
type: custom:proscenic-air-fryer-card
title: Air Fryer
device_id: 0123456789abcdef0123456789abcdef
```

The visual editor includes an air fryer device dropdown. The card then discovers the integration entities attached to that Home Assistant device.

If the device dropdown does not list the fryer, use **Pick any fryer entity** in the visual editor. The card will read that entity's owning device and use the same discovery path.

You can also use the status sensor fallback. For example, `sensor.t21_status` maps to entities such as:

- `switch.t21_power`
- `button.t21_start_cooking`
- `select.t21_preset`
- `number.t21_cooking_temperature`
- `number.t21_cooking_time`
- `sensor.t21_current_temperature`
- `sensor.t21_remaining_time`

If your entities are not attached to the same Home Assistant device or use different IDs, use the visual editor to set individual entity overrides.

## Features

- current status, preset, temperature, and remaining time
- start and power-off controls
- preset selector
- cooking temperature and cooking time sliders
- keep warm and delayed cook controls
- visual editor with entity pickers and display toggles

Starting a cooking appliance remotely has real-world safety implications. Use automations and remote controls conservatively.
