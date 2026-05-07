const CARD_NAME = "proscenic-air-fryer-card";
const EDITOR_NAME = "proscenic-air-fryer-card-editor";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ENTITY_SUFFIXES = {
  status: ["sensor", "status"],
  mode: ["sensor", "mode"],
  current_temperature: ["sensor", "current_temperature"],
  remaining_time: ["sensor", "remaining_time"],
  power: ["switch", "power"],
  start: ["button", "start_cooking", "start_stop"],
  preset: ["select", "preset"],
  cooking_temperature: ["number", "cooking_temperature"],
  cooking_time: ["number", "cooking_time"],
  delayed_cook: ["switch", "delayed_cook"],
  delayed_time: ["number", "delayed_time"],
  keep_warm: ["switch", "keep_warm"],
  warm_time: ["number", "keep_warm_time", "warm_time"],
};

const CONFIG_FIELDS = [
  ["status_entity", "Status sensor", ["sensor"]],
  ["power_entity", "Power switch", ["switch"]],
  ["start_entity", "Start button", ["button"]],
  ["preset_entity", "Preset selector", ["select"]],
  ["temperature_entity", "Cooking temperature", ["number"]],
  ["time_entity", "Cooking time", ["number"]],
  ["current_temperature_entity", "Current temperature", ["sensor"]],
  ["remaining_time_entity", "Remaining time", ["sensor"]],
  ["keep_warm_entity", "Keep warm switch", ["switch"]],
  ["warm_time_entity", "Keep warm time", ["number"]],
  ["delayed_cook_entity", "Delayed cook switch", ["switch"]],
  ["delayed_time_entity", "Delayed time", ["number"]],
];

const STATUS_LABELS = {
  off: "Off",
  standby: "Standby",
  stop: "Stopped",
  cooking: "Cooking",
  appointment: "Delayed",
  warm: "Keep warm",
  end: "Complete",
  unavailable: "Unavailable",
  unknown: "Unknown",
};

const prefixFromStatusEntity = (entityId) => {
  const match = String(entityId || "").match(/^sensor\.(.+)_status$/);
  return match ? match[1] : "";
};

const formatState = (state) => {
  if (!state) return "Unknown";
  const value = state.state;
  if (value === undefined || value === null || value === "") return "Unknown";
  return STATUS_LABELS[value] || state.attributes?.friendly_name || String(value);
};

class ProscenicAirFryerCardEditor extends HTMLElement {
  constructor() {
    super();
    this._config = {};
    this._rendered = false;
  }

  setConfig(config) {
    this._config = {
      type: `custom:${CARD_NAME}`,
      title: "Air Fryer",
      device_id: "",
      status_entity: "",
      device: "",
      show_keep_warm: true,
      show_delayed: true,
      show_secondary: true,
      ...config,
    };
    if (!this._rendered) {
      this._render();
      this._rendered = true;
    }
  }

  set hass(hass) {
    this._hass = hass;
    if (this._rendered) this._configurePickers();
  }

  _emit(patch = {}) {
    this._config = { ...this._config, ...patch };
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: this._config },
        bubbles: true,
        composed: true,
      })
    );
  }

  _render() {
    this.innerHTML = `
      <div class="editor">
        <style>
          .editor { padding:12px; display:grid; gap:14px; }
          .grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
          .section { display:grid; gap:10px; }
          .section h3 { margin:0; font-size:14px; font-weight:700; opacity:.86; }
          .hint { font-size:12px; opacity:.72; line-height:1.4; }
          @media (max-width: 640px) { .grid { grid-template-columns:1fr; } }
        </style>

        <ha-textfield id="title" label="Card title"></ha-textfield>
        <ha-device-picker id="device_id" label="Air fryer device"></ha-device-picker>
        <ha-entity-picker id="status_entity" label="Status sensor fallback"></ha-entity-picker>
        <ha-textfield id="device" label="Entity prefix fallback"></ha-textfield>
        <div class="hint">
          Select the fryer device when possible. Entity overrides are only needed if your entities do not belong to the same Home Assistant device.
        </div>

        <div class="section">
          <h3>Entity overrides</h3>
          <div class="grid">
            ${CONFIG_FIELDS.filter(([field]) => field !== "status_entity")
              .map(([field, label]) => `<ha-entity-picker id="${field}" label="${label}" allow-custom-entity></ha-entity-picker>`)
              .join("")}
          </div>
        </div>

        <div class="section">
          <h3>Visibility</h3>
          <ha-formfield label="Show keep warm controls"><ha-switch id="show_keep_warm"></ha-switch></ha-formfield>
          <ha-formfield label="Show delayed cook controls"><ha-switch id="show_delayed"></ha-switch></ha-formfield>
          <ha-formfield label="Show secondary readings"><ha-switch id="show_secondary"></ha-switch></ha-formfield>
        </div>
      </div>
    `;

    const q = (selector) => this.querySelector(selector);
    q("#title").value = this._config.title || "";
    q("#device").value = this._config.device || "";
    q("#show_keep_warm").checked = !!this._config.show_keep_warm;
    q("#show_delayed").checked = !!this._config.show_delayed;
    q("#show_secondary").checked = !!this._config.show_secondary;

    q("#title").addEventListener("input", (event) => this._emit({ title: event.target.value }));
    q("#device").addEventListener("input", (event) => this._emit({ device: event.target.value }));
    q("#device_id").addEventListener("value-changed", (event) => {
      this._emit({ device_id: event.detail?.value || "" });
    });
    q("#status_entity").addEventListener("value-changed", (event) => {
      const entity = event.detail?.value || "";
      const prefix = prefixFromStatusEntity(entity);
      this._emit({
        status_entity: entity,
        ...(prefix ? { device: prefix } : {}),
      });
      if (prefix) q("#device").value = prefix;
    });

    CONFIG_FIELDS.filter(([field]) => field !== "status_entity").forEach(([field]) => {
      q(`#${field}`).addEventListener("value-changed", (event) => this._emit({ [field]: event.detail?.value || "" }));
    });

    ["show_keep_warm", "show_delayed", "show_secondary"].forEach((field) => {
      q(`#${field}`).addEventListener("change", (event) => this._emit({ [field]: event.target.checked }));
    });

    this._configurePickers();
  }

  _configurePickers() {
    if (!this._hass) return;
    const devicePicker = this.querySelector("#device_id");
    if (devicePicker) {
      devicePicker.hass = this._hass;
      devicePicker.value = this._config.device_id || "";
    }
    CONFIG_FIELDS.forEach(([field, , domains]) => {
      const picker = this.querySelector(`#${field}`);
      if (!picker) return;
      picker.hass = this._hass;
      picker.includeDomains = domains;
      picker.value = this._config[field] || "";
    });
  }
}

if (!customElements.get(EDITOR_NAME)) {
  customElements.define(EDITOR_NAME, ProscenicAirFryerCardEditor);
}

class ProscenicAirFryerCard extends HTMLElement {
  constructor() {
    super();
    this._queue = Promise.resolve();
  }

  static getConfigElement() {
    return document.createElement(EDITOR_NAME);
  }

  static getStubConfig() {
    return {
      type: `custom:${CARD_NAME}`,
      title: "Air Fryer",
      device_id: "",
      status_entity: "",
      show_keep_warm: true,
      show_delayed: true,
      show_secondary: true,
    };
  }

  setConfig(config) {
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      throw new Error("Card configuration must be an object.");
    }
    this._config = {
      title: "Air Fryer",
      device_id: "",
      status_entity: "",
      device: "",
      show_keep_warm: true,
      show_delayed: true,
      show_secondary: true,
      ...config,
    };
  }

  set hass(hass) {
    this._hass = hass;
    this.render();
  }

  getCardSize() {
    return 5;
  }

  getGridOptions() {
    return {
      columns: 12,
      min_columns: 6,
      rows: 6,
      min_rows: 4,
    };
  }

  render() {
    if (!this._hass || !this._config) return;

    const entities = this.entities();
    const hasDevice = !!this._config.device_id || !!this.devicePrefix() || !!this._config.status_entity;
    if (!hasDevice) {
      this.innerHTML = `
        <ha-card>
          <div class="warn">Proscenic Air Fryer Card: select the fryer device in the visual editor.</div>
          <style>.warn{padding:16px;color:var(--error-color);font-weight:700;}</style>
        </ha-card>
      `;
      return;
    }

    const statusState = this.stateObj(entities.status);
    const status = String(statusState?.state || "unknown");
    const isActive = ["cooking", "appointment", "warm"].includes(status);
    const title = this._config.title || "Air Fryer";

    this.innerHTML = `
      <ha-card>
        <style>${this.styles()}</style>
        <div class="card">
          <header class="header">
            <div>
              <div class="eyebrow">Proscenic</div>
              <h2>${this.escape(title)}</h2>
            </div>
            <div class="status-pill ${isActive ? "active" : ""}">
              <ha-icon icon="${isActive ? "mdi:fire" : "mdi:power-standby"}"></ha-icon>
              <span>${this.escape(STATUS_LABELS[status] || formatState(statusState))}</span>
            </div>
          </header>

          <div class="hero">
            <div class="dial ${isActive ? "active" : ""}">
              <ha-icon icon="mdi:toaster-oven"></ha-icon>
            </div>
            <div class="readings">
              <div class="reading">
                <span>Preset</span>
                <strong>${this.entityStateText(entities.preset) || this.entityStateText(entities.mode) || "Manual"}</strong>
              </div>
              <div class="reading">
                <span>Temp</span>
                <strong>${this.entityStateText(entities.current_temperature) || this.entityStateText(entities.cooking_temperature) || "-"}</strong>
              </div>
              <div class="reading">
                <span>Time</span>
                <strong>${this.entityStateText(entities.remaining_time) || this.entityStateText(entities.cooking_time) || "-"}</strong>
              </div>
            </div>
          </div>

          <div class="controls primary">
            ${this.actionButton("start", entities.start, "Start", "mdi:play", !entities.start)}
            ${this.actionButton("power-off", entities.power, "Power Off", "mdi:power", !entities.power)}
            ${this.moreInfoButton(entities.status, "Details", "mdi:information-outline")}
          </div>

          ${this.renderPreset(entities)}
          ${this.renderNumber("Cooking Temperature", entities.cooking_temperature, "mdi:thermometer")}
          ${this.renderNumber("Cooking Time", entities.cooking_time, "mdi:timer")}
          ${this._config.show_keep_warm ? this.renderOptionalRow("Keep Warm", entities.keep_warm, entities.warm_time, "mdi:heat-wave") : ""}
          ${this._config.show_delayed ? this.renderOptionalRow("Delayed Cook", entities.delayed_cook, entities.delayed_time, "mdi:timer-outline") : ""}
          ${this._config.show_secondary ? this.renderSecondary(entities) : ""}
        </div>
      </ha-card>
    `;

    this.bindEvents();
  }

  devicePrefix() {
    return (
      String(this._config.device || "").trim() ||
      prefixFromStatusEntity(this._config.status_entity) ||
      this.autoDetectedPrefix()
    );
  }

  autoDetectedPrefix() {
    const prefixes = Object.keys(this._hass?.states || {})
      .map(prefixFromStatusEntity)
      .filter((prefix) => prefix && this._hass.states[`button.${prefix}_start_cooking`]);
    const unique = [...new Set(prefixes)];
    return unique.length === 1 ? unique[0] : "";
  }

  entities() {
    const prefix = this.devicePrefix();
    const deviceEntityIds = this.deviceEntityIds();
    const bySuffix = (key) => {
      const configured = this._config[`${key}_entity`];
      if (configured) return configured;
      const suffix = ENTITY_SUFFIXES[key];
      const domain = suffix[0];
      const fromDevice = this.findDeviceEntity(domain, suffix.slice(1), deviceEntityIds);
      if (fromDevice) return fromDevice;
      if (!prefix || !suffix) return "";
      for (const part of suffix.slice(1)) {
        const entityId = `${domain}.${prefix}_${part}`;
        if (this._hass.states[entityId]) return entityId;
      }
      return `${domain}.${prefix}_${suffix[1]}`;
    };
    return {
      status: this._config.status_entity || bySuffix("status"),
      mode: bySuffix("mode"),
      current_temperature: this._config.current_temperature_entity || bySuffix("current_temperature"),
      remaining_time: this._config.remaining_time_entity || bySuffix("remaining_time"),
      power: this._config.power_entity || bySuffix("power"),
      start: this._config.start_entity || bySuffix("start"),
      preset: this._config.preset_entity || bySuffix("preset"),
      cooking_temperature: this._config.temperature_entity || bySuffix("cooking_temperature"),
      cooking_time: this._config.time_entity || bySuffix("cooking_time"),
      delayed_cook: this._config.delayed_cook_entity || bySuffix("delayed_cook"),
      delayed_time: this._config.delayed_time_entity || bySuffix("delayed_time"),
      keep_warm: this._config.keep_warm_entity || bySuffix("keep_warm"),
      warm_time: this._config.warm_time_entity || bySuffix("warm_time"),
    };
  }

  deviceEntityIds() {
    const deviceId = this._config.device_id;
    if (!deviceId || !this._hass?.entities) return [];
    return Object.entries(this._hass.entities)
      .filter(([, info]) => info?.device_id === deviceId)
      .map(([entityId]) => entityId)
      .filter((entityId) => this._hass.states[entityId]);
  }

  findDeviceEntity(domain, suffixes, entityIds) {
    const candidates = entityIds.filter((entityId) => entityId.startsWith(`${domain}.`));
    for (const suffix of suffixes) {
      const exact = candidates.find((entityId) => entityId.endsWith(`_${suffix}`));
      if (exact) return exact;
    }
    for (const suffix of suffixes) {
      const target = this.cleanName(suffix);
      const match = candidates.find((entityId) => this.cleanName(this.entityLabel(entityId)).includes(target));
      if (match) return match;
    }
    return "";
  }

  entityLabel(entityId) {
    const state = this.stateObj(entityId);
    const info = this._hass?.entities?.[entityId];
    return state?.attributes?.friendly_name || info?.name || info?.original_name || entityId;
  }

  renderPreset(entities) {
    const state = this.stateObj(entities.preset);
    if (!state || state.state === "unavailable") return "";
    const options = state.attributes?.options || [];
    return `
      <section class="section">
        <div class="section-title">
          <ha-icon icon="mdi:silverware-fork-knife"></ha-icon>
          <span>Preset</span>
        </div>
        <select data-preset="${this.escapeAttr(entities.preset)}">
          ${options.map((option) => `<option value="${this.escapeAttr(option)}" ${option === state.state ? "selected" : ""}>${this.escape(option)}</option>`).join("")}
        </select>
      </section>
    `;
  }

  renderNumber(label, entityId, icon) {
    const state = this.stateObj(entityId);
    if (!state || state.state === "unavailable") return "";
    const min = Number(state.attributes?.min ?? 0);
    const max = Number(state.attributes?.max ?? 100);
    const step = Number(state.attributes?.step ?? 1);
    const value = Number(state.state);
    const unit = state.attributes?.unit_of_measurement || "";
    return `
      <section class="section">
        <div class="section-title">
          <ha-icon icon="${icon}"></ha-icon>
          <span>${this.escape(label)}</span>
          <strong>${Number.isFinite(value) ? `${value}${unit ? ` ${this.escape(unit)}` : ""}` : "-"}</strong>
        </div>
        <ha-slider data-number="${this.escapeAttr(entityId)}" min="${min}" max="${max}" step="${step}" value="${Number.isFinite(value) ? value : min}" pin></ha-slider>
      </section>
    `;
  }

  renderOptionalRow(label, switchEntity, numberEntity, icon) {
    const switchState = this.stateObj(switchEntity);
    const numberState = this.stateObj(numberEntity);
    if (!switchState && !numberState) return "";
    return `
      <section class="section optional">
        <button class="toggle ${switchState?.state === "on" ? "is-on" : ""}" data-toggle="${this.escapeAttr(switchEntity)}" ${!switchState ? "disabled" : ""}>
          <ha-icon icon="${icon}"></ha-icon>
          <span>${this.escape(label)}</span>
        </button>
        ${numberState ? this.compactNumber(numberEntity, numberState) : ""}
      </section>
    `;
  }

  compactNumber(entityId, state) {
    const min = Number(state.attributes?.min ?? 0);
    const max = Number(state.attributes?.max ?? 100);
    const step = Number(state.attributes?.step ?? 1);
    const value = Number(state.state);
    return `<ha-slider class="compact" data-number="${this.escapeAttr(entityId)}" min="${min}" max="${max}" step="${step}" value="${Number.isFinite(value) ? value : min}"></ha-slider>`;
  }

  renderSecondary(entities) {
    const items = [
      ["Status", entities.status],
      ["Mode", entities.mode],
      ["Remaining", entities.remaining_time],
    ].filter(([, entityId]) => this.stateObj(entityId));
    if (!items.length) return "";
    return `
      <div class="secondary">
        ${items.map(([label, entityId]) => `
          <button data-more-info="${this.escapeAttr(entityId)}">
            <span>${this.escape(label)}</span>
            <strong>${this.entityStateText(entityId)}</strong>
          </button>
        `).join("")}
      </div>
    `;
  }

  actionButton(action, entityId, label, icon, disabled) {
    return `
      <button class="action ${action}" data-action="${this.escapeAttr(action)}" data-entity="${this.escapeAttr(entityId)}" ${disabled ? "disabled" : ""}>
        <ha-icon icon="${icon}"></ha-icon>
        <span>${this.escape(label)}</span>
      </button>
    `;
  }

  moreInfoButton(entityId, label, icon) {
    return `
      <button class="action ghost" data-more-info="${this.escapeAttr(entityId)}" ${!entityId ? "disabled" : ""}>
        <ha-icon icon="${icon}"></ha-icon>
        <span>${this.escape(label)}</span>
      </button>
    `;
  }

  bindEvents() {
    this.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", () => this.handleAction(button.dataset.action, button.dataset.entity));
    });
    this.querySelectorAll("[data-toggle]").forEach((button) => {
      button.addEventListener("click", () => this.toggleEntity(button.dataset.toggle));
    });
    this.querySelectorAll("[data-number]").forEach((slider) => {
      slider.addEventListener("change", (event) => this.setNumber(slider.dataset.number, Number(event.target.value)));
    });
    this.querySelectorAll("[data-preset]").forEach((select) => {
      select.addEventListener("change", (event) => this.selectPreset(select.dataset.preset, event.target.value));
    });
    this.querySelectorAll("[data-more-info]").forEach((button) => {
      button.addEventListener("click", () => this.moreInfo(button.dataset.moreInfo));
    });
  }

  handleAction(action, entityId) {
    if (!entityId) return;
    if (action === "start") {
      this.enqueue(() => this._hass.callService("button", "press", { entity_id: entityId }));
    }
    if (action === "power-off") {
      this.enqueue(() => this._hass.callService("switch", "turn_off", { entity_id: entityId }));
    }
  }

  toggleEntity(entityId) {
    const state = this.stateObj(entityId);
    if (!state) return;
    const service = state.state === "on" ? "turn_off" : "turn_on";
    this.enqueue(() => this._hass.callService("switch", service, { entity_id: entityId }));
  }

  setNumber(entityId, value) {
    if (!entityId || !Number.isFinite(value)) return;
    this.enqueue(() => this._hass.callService("number", "set_value", { entity_id: entityId, value }));
  }

  selectPreset(entityId, option) {
    if (!entityId || !option) return;
    this.enqueue(() => this._hass.callService("select", "select_option", { entity_id: entityId, option }));
  }

  moreInfo(entityId) {
    if (!entityId) return;
    this.dispatchEvent(
      new CustomEvent("hass-more-info", {
        detail: { entityId },
        bubbles: true,
        composed: true,
      })
    );
  }

  enqueue(fn) {
    this._queue = this._queue
      .then(fn)
      .then(() => sleep(150))
      .catch((err) => console.error("Proscenic Air Fryer Card command failed:", err));
    return this._queue;
  }

  stateObj(entityId) {
    return entityId ? this._hass?.states?.[entityId] : undefined;
  }

  entityStateText(entityId) {
    const state = this.stateObj(entityId);
    if (!state) return "";
    if (state.state === "unknown" || state.state === "unavailable") return state.state;
    const unit = state.attributes?.unit_of_measurement;
    return `${state.state}${unit ? ` ${unit}` : ""}`;
  }

  cleanName(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  styles() {
    return `
      ha-card {
        overflow: hidden;
        border-radius: var(--ha-card-border-radius, 12px);
      }
      .card {
        padding: 16px;
        display: grid;
        gap: 14px;
      }
      .header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: flex-start;
      }
      .eyebrow {
        color: var(--secondary-text-color);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      h2 {
        margin: 2px 0 0;
        font-size: 22px;
        line-height: 1.15;
      }
      .status-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border: 1px solid var(--divider-color);
        border-radius: 999px;
        padding: 7px 10px;
        font-weight: 700;
        color: var(--secondary-text-color);
        white-space: nowrap;
      }
      .status-pill.active {
        color: var(--text-primary-color);
        background: color-mix(in srgb, var(--warning-color, #ff9800) 24%, transparent);
        border-color: color-mix(in srgb, var(--warning-color, #ff9800) 52%, var(--divider-color));
      }
      .hero {
        display: grid;
        grid-template-columns: 96px 1fr;
        gap: 14px;
        align-items: center;
      }
      .dial {
        width: 96px;
        height: 96px;
        border-radius: 24px;
        display: grid;
        place-items: center;
        background: linear-gradient(145deg, color-mix(in srgb, var(--primary-color) 18%, var(--card-background-color)), var(--card-background-color));
        border: 1px solid var(--divider-color);
      }
      .dial ha-icon {
        --mdc-icon-size: 48px;
        color: var(--primary-color);
      }
      .dial.active {
        background: linear-gradient(145deg, color-mix(in srgb, var(--warning-color, #ff9800) 32%, var(--card-background-color)), var(--card-background-color));
      }
      .dial.active ha-icon {
        color: var(--warning-color, #ff9800);
      }
      .readings {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }
      .reading,
      .secondary button {
        min-width: 0;
        border: 1px solid var(--divider-color);
        border-radius: 10px;
        background: color-mix(in srgb, var(--card-background-color) 88%, var(--primary-text-color));
        padding: 10px;
      }
      .reading span,
      .secondary span {
        display: block;
        color: var(--secondary-text-color);
        font-size: 12px;
        font-weight: 700;
      }
      .reading strong,
      .secondary strong {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        margin-top: 4px;
        font-size: 16px;
      }
      .controls {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }
      button,
      select {
        font: inherit;
      }
      button {
        cursor: pointer;
      }
      button:disabled {
        opacity: .45;
        cursor: not-allowed;
      }
      .action,
      .toggle {
        min-height: 44px;
        border-radius: 12px;
        border: 1px solid var(--divider-color);
        background: var(--card-background-color);
        color: var(--primary-text-color);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        font-weight: 800;
      }
      .action.start {
        background: var(--primary-color);
        border-color: var(--primary-color);
        color: var(--text-primary-color);
      }
      .action.power-off {
        border-color: color-mix(in srgb, var(--error-color) 54%, var(--divider-color));
        color: var(--error-color);
      }
      .action.ghost {
        color: var(--secondary-text-color);
      }
      .section {
        display: grid;
        gap: 8px;
      }
      .section-title {
        display: grid;
        grid-template-columns: 22px 1fr auto;
        gap: 8px;
        align-items: center;
        color: var(--secondary-text-color);
        font-size: 13px;
        font-weight: 800;
      }
      .section-title strong {
        color: var(--primary-text-color);
      }
      ha-slider {
        width: 100%;
        --mdc-slider-track-height: 6px;
        --mdc-slider-handle-size: 18px;
      }
      select {
        width: 100%;
        min-height: 44px;
        border-radius: 10px;
        border: 1px solid var(--divider-color);
        background: var(--card-background-color);
        color: var(--primary-text-color);
        padding: 0 10px;
      }
      .optional {
        grid-template-columns: minmax(140px, 180px) 1fr;
        align-items: center;
      }
      .toggle {
        justify-content: flex-start;
        padding: 0 12px;
      }
      .toggle.is-on {
        border-color: var(--success-color);
        background: color-mix(in srgb, var(--success-color) 24%, transparent);
      }
      .secondary {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }
      .secondary button {
        text-align: left;
        color: var(--primary-text-color);
      }
      @media (max-width: 520px) {
        .header,
        .hero {
          grid-template-columns: 1fr;
          display: grid;
        }
        .dial {
          width: 76px;
          height: 76px;
          border-radius: 18px;
        }
        .readings,
        .controls,
        .secondary {
          grid-template-columns: 1fr;
        }
        .optional {
          grid-template-columns: 1fr;
        }
      }
    `;
  }

  escape(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[char]);
  }

  escapeAttr(value) {
    return this.escape(value);
  }
}

if (!customElements.get(CARD_NAME)) {
  customElements.define(CARD_NAME, ProscenicAirFryerCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: CARD_NAME,
    name: "Proscenic Air Fryer Card",
    description: "Control and monitor a Proscenic air fryer.",
    preview: true,
  });
}
