import { ICONS, HSL_COLORS } from './constants.js';
import { clamp01, clamp255, rgbToHsl, hslToRgb, hueDistance } from './color.js';
import { CurveEditor } from './curve.js';

export class ImageEditor {
    constructor(imageSrc, saveCallback) {
        this.imageSrc = imageSrc;
        this.saveCallback = saveCallback;
        
        // State
        this.params = {
            exposure: 0,    // -100 to 100
            contrast: 0,    // -100 to 100
            saturation: 0,  // -100 to 100
            temp: 0,        // -100 to 100
            tint: 0,        // -100 to 100
            vibrance: 0,    // -100 to 100
            hue: 0,         // -180 to 180
            highlight: 0,   // -100 to 100
            shadow: 0,      // -100 to 100
            blur: 0,        // 0 to 100
            noise: 0,       // 0 to 100
            grain: 0,       // 0 to 100
            clarity: 0,     // -100 to 100
            dehaze: 0,      // -100 to 100
            hslHue: 0,      // -180 to 180 (current selection)
            hslSaturation: 0, // -100 to 100 (current selection)
            hslLightness: 0  // -100 to 100 (current selection)
        };
        this.activeHSLColor = HSL_COLORS[0]?.id || null;
        this.hslAdjustments = this.getDefaultHSLAdjustments();
        this.curveEditor = null;

        this.history = [];
        this.historyIndex = -1;
        
        this.zoom = 1;
        this.pan = { x: 0, y: 0 };
        this.isDragging = false;
        this.lastMousePos = { x: 0, y: 0 };
        
        this.isCropping = false;
        this.cropStart = null;
        this.cropRect = null;
        this.activeHandle = null;
        
        this.createUI();
        this.loadImage();
    }

    createUI() {
        this.overlay = document.createElement("div");
        this.overlay.className = "apix-overlay";
        
        this.overlay.innerHTML = `
            <!-- Left Sidebar -->
            <div class="apix-sidebar-left">
                <button class="apix-tool-btn apix-mode-btn active" id="tool-adjust" title="Adjustments">${ICONS.adjust}</button>
                <button class="apix-tool-btn apix-mode-btn" id="tool-crop" title="Crop">${ICONS.crop}</button>
                <div class="apix-sidebar-divider"></div>
                <button class="apix-tool-btn icon-only" id="flip-btn-horizontal" title="Flip Horizontal">${ICONS.flipH}</button>
                <button class="apix-tool-btn icon-only" id="flip-btn-vertical" title="Flip Vertical">${ICONS.flipV}</button>
                <button class="apix-tool-btn icon-only" id="rotate-btn-90" title="Rotate 90 degrees">${ICONS.rotate}</button>
            </div>

            <!-- Main Area -->
            <div class="apix-main-area">
                <div class="apix-header">
                    <div class="apix-header-title">
                        <span>Image Editor</span>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <button class="apix-tool-btn" id="action-undo" title="Undo" disabled>${ICONS.undo}</button>
                        <button class="apix-tool-btn" id="action-redo" title="Redo" disabled>${ICONS.redo}</button>
                        <div style="width:1px; background:var(--apix-border); margin:0 5px;"></div>
                        <button class="apix-btn apix-btn-secondary" id="action-reset">Reset All</button>
                    </div>
                </div>
                
                <div class="apix-canvas-container" id="canvas-container">
                    <canvas id="editor-canvas"></canvas>
                    <div id="crop-box" class="apix-crop-overlay">
                        <div class="apix-crop-handle handle-tl" data-handle="tl"></div>
                        <div class="apix-crop-handle handle-tr" data-handle="tr"></div>
                        <div class="apix-crop-handle handle-bl" data-handle="bl"></div>
                        <div class="apix-crop-handle handle-br" data-handle="br"></div>
                        <div class="apix-crop-handle handle-t" data-handle="t"></div>
                        <div class="apix-crop-handle handle-b" data-handle="b"></div>
                        <div class="apix-crop-handle handle-l" data-handle="l"></div>
                        <div class="apix-crop-handle handle-r" data-handle="r"></div>
                    </div>
                </div>

                <div class="apix-bottom-bar">
                    <button class="apix-tool-btn" style="width:24px;height:24px;" id="zoom-out">-</button>
                    <span id="zoom-level">100%</span>
                    <button class="apix-tool-btn" style="width:24px;height:24px;" id="zoom-in">+</button>
                    <button class="apix-btn apix-btn-secondary" style="padding:2px 8px; font-size:10px; margin-left:10px;" id="zoom-fit">Fit</button>
                </div>
            </div>

            <!-- Right Sidebar -->
            <div class="apix-sidebar-right" id="sidebar-right">
                <div class="apix-sidebar-scroll">
                    <!-- Crop Controls (Hidden by default) -->
                    <div class="apix-panel-content hidden" id="panel-crop-controls" style="flex:1;">
                        <div class="apix-control-row">
                            <label class="apix-control-label">Aspect Ratio</label>
                            <select id="crop-aspect" style="background:#333; color:#fff; border:none; padding:8px; border-radius:4px; width:100%;">
                                <option value="free">Free</option>
                                <option value="1">1:1 (Square)</option>
                                <option value="1.777">16:9</option>
                                <option value="0.5625">9:16</option>
                                <option value="1.333">4:3</option>
                                <option value="0.75">3:4</option>
                                <option value="1.5">3:2</option>
                                <option value="0.666">2:3</option>
                                <option value="0.8">4:5</option>
                                <option value="1.25">5:4</option>
                            </select>
                        </div>
                        <div style="margin-top:20px; display:flex; gap:10px;">
                            <button class="apix-btn apix-btn-secondary" style="flex:1" id="crop-cancel">Cancel</button>
                            <button class="apix-btn apix-btn-primary" style="flex:1" id="crop-apply">Apply Crop</button>
                        </div>
                    </div>

                    <!-- Light -->
                    <div class="apix-panel-section">
                        <div class="apix-panel-header" data-target="panel-light">
                            <span>Light</span>
                            ${ICONS.chevronDown}
                        </div>
                        <div class="apix-panel-content" id="panel-light">
                            ${this.renderSlider("Exposure", "exposure", -100, 100, 0)}
                            ${this.renderSlider("Contrast", "contrast", -100, 100, 0)}
                            ${this.renderSlider("Highlights", "highlight", -100, 100, 0)}
                            ${this.renderSlider("Shadows", "shadow", -100, 100, 0)}
                        </div>
                    </div>

                    <!-- Color -->
                    <div class="apix-panel-section">
                        <div class="apix-panel-header" data-target="panel-color">
                            <span>Color</span>
                            ${ICONS.chevronDown}
                        </div>
                        <div class="apix-panel-content" id="panel-color">
                            ${this.renderSlider("Temp", "temp", -100, 100, 0)}
                            ${this.renderSlider("Tint", "tint", -100, 100, 0)}
                            ${this.renderSlider("Saturation", "saturation", -100, 100, 0)}
                            ${this.renderSlider("Vibrance", "vibrance", -100, 100, 0)}
                            ${this.renderSlider("Hue", "hue", -180, 180, 0)}
                        </div>
                    </div>

                    <!-- Curve -->
                    <div class="apix-panel-section">
                        <div class="apix-panel-header" data-target="panel-curve">
                            <span>Curve</span>
                            ${ICONS.chevronDown}
                        </div>
                        <div class="apix-panel-content" id="panel-curve">
                            ${this.renderCurvePanel()}
                        </div>
                    </div>

                    <!-- Effect -->
                    <div class="apix-panel-section">
                        <div class="apix-panel-header" data-target="panel-detail">
                            <span>Effect</span>
                            ${ICONS.chevronDown}
                        </div>
                        <div class="apix-panel-content hidden" id="panel-detail">
                            ${this.renderSlider("Blur", "blur", 0, 100, 0)}
                            ${this.renderSlider("Noise", "noise", 0, 100, 0)}
                            ${this.renderSlider("Grain", "grain", 0, 100, 0)}
                            ${this.renderSlider("Clarity", "clarity", -100, 100, 0)}
                            ${this.renderSlider("Dehaze", "dehaze", -100, 100, 0)}
                        </div>
                    </div>

                    <!-- HSL -->
                    <div class="apix-panel-section">
                        <div class="apix-panel-header" data-target="panel-hsl">
                            <span>HSL</span>
                            ${ICONS.chevronDown}
                        </div>
                        <div class="apix-panel-content hidden" id="panel-hsl">
                            ${this.renderHSLSection()}
                        </div>
                    </div>
                </div>

                <div class="apix-footer">
                    <button class="apix-btn apix-btn-secondary" id="action-close">Cancel</button>
                    <div style="display:flex; gap:8px;">
                        <button class="apix-btn apix-btn-secondary" id="action-download">Download</button>
                        <button class="apix-btn apix-btn-primary" id="action-save">Save Image</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(this.overlay);
        this.bindEvents();
    }

    renderSlider(label, id, min, max, val) {
        return `
            <div class="apix-control-row">
                <div class="apix-control-label">
                    <span>${label}</span>
                    <div class="apix-slider-meta">
                        <span id="val-${id}">${val}</span>
                    </div>
                </div>
                <div class="apix-slider-wrapper">
                    <input type="range" class="apix-slider" id="param-${id}" min="${min}" max="${max}" value="${val}" data-default="${val}">
                    <button type="button" class="apix-slider-reset" data-slider="param-${id}" data-default="${val}" title="Reset ${label}" aria-label="Reset ${label}">${ICONS.reset}</button>
                </div>
            </div>
        `;
    }

    renderCurvePanel() {
        return `
            <div class="apix-curve-panel">
                <div class="apix-curve-toolbar">
                    <span>Adjust</span>
                    <div class="apix-curve-channel-buttons">
                        <button type="button" class="apix-curve-channel-btn active" data-curve-channel="rgb" title="RGB Curve">RGB</button>
                        <button type="button" class="apix-curve-channel-btn" data-curve-channel="r" title="Red Curve">R</button>
                        <button type="button" class="apix-curve-channel-btn" data-curve-channel="g" title="Green Curve">G</button>
                        <button type="button" class="apix-curve-channel-btn" data-curve-channel="b" title="Blue Curve">B</button>
                    </div>
                    <button type="button" class="apix-curve-reset" id="curve-reset">Reset</button>
                </div>
                <div class="apix-curve-stage">
                    <canvas id="curve-canvas" width="240" height="240"></canvas>
                </div>
            </div>
        `;
    }

    renderHSLSection() {
        if (!this.activeHSLColor && HSL_COLORS.length) {
            this.activeHSLColor = HSL_COLORS[0].id;
        }
        const swatches = HSL_COLORS.map(color => `
            <button type="button" class="apix-hsl-chip${color.id === this.activeHSLColor ? " active" : ""}" data-color="${color.id}" style="--chip-color:${color.color}" title="${color.label}"></button>
        `).join("");
        return `
            <div class="apix-hsl">
                <div class="apix-hsl-swatches">${swatches}</div>
                ${this.renderHSLSlider("Hue", "h", -180, 180, this.params.hslHue)}
                ${this.renderHSLSlider("Saturation", "s", -100, 100, this.params.hslSaturation)}
                ${this.renderHSLSlider("Luminance", "l", -100, 100, this.params.hslLightness)}
                <div class="apix-hsl-actions">
                    <span id="hsl-active-label">${this.getActiveHSLLabel()}</span>
                    <button type="button" class="apix-hsl-reset" id="hsl-reset">Reset</button>
                </div>
            </div>
        `;
    }

    renderHSLSlider(label, key, min, max, val) {
        return `
            <div class="apix-control-row apix-hsl-slider">
                <div class="apix-control-label">
                    <span>${label}</span>
                    <div class="apix-slider-meta">
                        <span id="val-hsl-${key}">${val}</span>
                    </div>
                </div>
                <div class="apix-slider-wrapper">
                    <input type="range" class="apix-slider" id="hsl-slider-${key}" min="${min}" max="${max}" value="${val}" data-default="0">
                    <button type="button" class="apix-slider-reset" data-slider="hsl-slider-${key}" data-default="0" data-hsl="true" data-hsl-key="${key}" title="Reset ${label}" aria-label="Reset ${label}">${ICONS.reset}</button>
                </div>
            </div>
        `;
    }

    getActiveHSLLabel() {
        const active = HSL_COLORS.find(c => c.id === this.activeHSLColor);
        return active ? active.label : (HSL_COLORS[0]?.label || "Color");
    }

    bindEvents() {
        this.canvas = this.overlay.querySelector("#editor-canvas");
        this.ctx = this.canvas.getContext("2d");
        this.container = this.overlay.querySelector("#canvas-container");
        this.cropBox = this.overlay.querySelector("#crop-box");

        // Sliders
        const hslKeys = new Set(["hslHue", "hslSaturation", "hslLightness"]);
        Object.keys(this.params).forEach(key => {
            if (hslKeys.has(key)) return;
            const slider = this.overlay.querySelector(`#param-${key}`);
            if (!slider) return;
            slider.oninput = (e) => {
                const val = parseFloat(e.target.value);
                this.params[key] = val;
                const display = this.overlay.querySelector(`#val-${key}`);
                if (display) display.textContent = val;
                this.requestRender();
            };
            slider.onchange = () => this.pushHistory(); // Save state on release
        });
        this.bindHSLControls();
        this.initCurveEditor();

        // Accordions
        this.overlay.querySelectorAll(".apix-panel-header").forEach(header => {
            header.onclick = () => {
                const targetId = header.dataset.target;
                const content = this.overlay.querySelector(`#${targetId}`);
                const isHidden = content.classList.contains("hidden");
                // Close all first (optional, mimicking accordion)
                // this.overlay.querySelectorAll(".apix-panel-content").forEach(c => c.classList.add("hidden"));
                content.classList.toggle("hidden", !isHidden);
                header.querySelector("svg").style.transform = isHidden ? "rotate(180deg)" : "rotate(0deg)";
            };
        });

        // Tools
        this.overlay.querySelector("#tool-crop").onclick = () => this.toggleMode('crop');
        this.overlay.querySelector("#tool-adjust").onclick = () => this.toggleMode('adjust');
        
        // Crop Actions
        this.overlay.querySelector("#crop-apply").onclick = () => this.applyCrop();
        this.overlay.querySelector("#crop-cancel").onclick = () => this.toggleMode('adjust');

        // Zoom/Pan
        this.container.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            this.zoom = Math.max(0.1, Math.min(10, this.zoom * delta));
            this.updateZoomDisplay();
            this.requestRender();
        });
        
        this.container.addEventListener('mousedown', (e) => {
            if (this.isCropping) {
                this.handleCropStart(e);
            } else {
                this.isDragging = true;
                this.lastMousePos = { x: e.clientX, y: e.clientY };
                this.container.style.cursor = 'grabbing';
            }
        });
        
        window.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                const dx = e.clientX - this.lastMousePos.x;
                const dy = e.clientY - this.lastMousePos.y;
                this.pan.x += dx;
                this.pan.y += dy;
                this.lastMousePos = { x: e.clientX, y: e.clientY };
                this.requestRender();
            } else if (this.isCropping) {
                this.handleCropMove(e);
            }
        });
        
        window.addEventListener('mouseup', () => {
            this.isDragging = false;
            this.container.style.cursor = this.isCropping ? 'crosshair' : 'grab';
            if (this.isCropping) this.handleCropEnd();
        });

        // Zoom Buttons
        this.overlay.querySelector("#zoom-in").onclick = () => { this.zoom *= 1.2; this.updateZoomDisplay(); this.requestRender(); };
        this.overlay.querySelector("#zoom-out").onclick = () => { this.zoom /= 1.2; this.updateZoomDisplay(); this.requestRender(); };
        this.overlay.querySelector("#zoom-fit").onclick = () => this.fitCanvas();

        // Transform buttons
        this.overlay.querySelector("#flip-btn-horizontal").onclick = () => this.flipImage("horizontal");
        this.overlay.querySelector("#flip-btn-vertical").onclick = () => this.flipImage("vertical");
        this.overlay.querySelector("#rotate-btn-90").onclick = () => this.rotateImage(90);

        // Main Actions
        this.overlay.querySelector("#action-close").onclick = () => this.close();
        this.overlay.querySelector("#action-save").onclick = () => this.save();
        this.overlay.querySelector("#action-download").onclick = () => this.download();
        this.overlay.querySelector("#action-reset").onclick = () => this.reset();
        this.overlay.querySelector("#action-undo").onclick = () => this.undo();
        this.overlay.querySelector("#action-redo").onclick = () => this.redo();
    }

    bindHSLControls() {
        if (!this.overlay) return;
        this.overlay.querySelectorAll(".apix-hsl-chip").forEach(btn => {
            btn.onclick = () => {
                this.activeHSLColor = btn.dataset.color;
                this.syncHSLSliders();
                this.updateHSLUI();
            };
        });

        const hslMap = { h: "hslHue", s: "hslSaturation", l: "hslLightness" };
        ["h", "s", "l"].forEach(key => {
            const slider = this.overlay.querySelector(`#hsl-slider-${key}`);
            if (!slider) return;
            slider.oninput = (e) => {
                const val = parseFloat(e.target.value);
                const current = this.hslAdjustments[this.activeHSLColor];
                current[key] = val;
                this.params[hslMap[key]] = val;
                const label = this.overlay.querySelector(`#val-hsl-${key}`);
                if (label) label.textContent = val;
                this.requestRender();
            };
            slider.onchange = () => this.pushHistory();
        });

        const resetBtn = this.overlay.querySelector("#hsl-reset");
        if (resetBtn) {
            resetBtn.onclick = () => {
                this.resetCurrentHSL();
                this.pushHistory();
            };
        }

        this.syncHSLSliders();
        this.updateHSLUI();
        this.bindSliderResetButtons();
    }

    initCurveEditor() {
        if (!this.overlay) return;
        const canvas = this.overlay.querySelector("#curve-canvas");
        if (!canvas) return;
        const channelButtons = Array.from(this.overlay.querySelectorAll(".apix-curve-channel-btn"));
        const resetBtn = this.overlay.querySelector("#curve-reset");
        this.curveEditor = new CurveEditor({
            canvas,
            channelButtons,
            resetButton: resetBtn,
            onChange: () => this.requestRender(),
            onCommit: () => this.pushHistory()
        });
    }

    resetCurrentHSL() {
        const current = this.hslAdjustments[this.activeHSLColor];
        if (!current) return;
        current.h = 0;
        current.s = 0;
        current.l = 0;
        this.syncHSLSliders();
        this.requestRender();
    }

    syncHSLSliders() {
        const current = this.hslAdjustments[this.activeHSLColor];
        if (!current || !this.overlay) return;
        const map = { h: "hslHue", s: "hslSaturation", l: "hslLightness" };
        ["h", "s", "l"].forEach(key => {
            const slider = this.overlay.querySelector(`#hsl-slider-${key}`);
            if (slider) slider.value = current[key];
            const label = this.overlay.querySelector(`#val-hsl-${key}`);
            if (label) label.textContent = current[key];
            this.params[map[key]] = current[key];
        });
    }

    updateHSLUI() {
        if (!this.overlay) return;
        this.overlay.querySelectorAll(".apix-hsl-chip").forEach(btn => {
            btn.classList.toggle("active", btn.dataset.color === this.activeHSLColor);
        });
        const label = this.overlay.querySelector("#hsl-active-label");
        if (label) label.textContent = this.getActiveHSLLabel();
    }

    bindSliderResetButtons() {
        if (!this.overlay) return;
        const hslMap = { h: "hslHue", s: "hslSaturation", l: "hslLightness" };
        this.overlay.querySelectorAll(".apix-slider-reset").forEach(btn => {
            const sliderId = btn.dataset.slider;
            const slider = this.overlay.querySelector(`#${sliderId}`);
            if (!slider) return;
            const defaultVal = parseFloat(btn.dataset.default ?? "0");
            const isHSL = btn.dataset.hsl === "true";
            btn.onclick = () => {
                slider.value = defaultVal;
                if (!isHSL) {
                    const paramKey = sliderId.replace("param-", "");
                    if (this.params.hasOwnProperty(paramKey)) {
                        this.params[paramKey] = defaultVal;
                    }
                    const valueLabel = this.overlay.querySelector(`#val-${paramKey}`);
                    if (valueLabel) valueLabel.textContent = defaultVal;
                } else {
                    const key = btn.dataset.hslKey;
                    const current = this.hslAdjustments[this.activeHSLColor];
                    if (current) {
                        current[key] = defaultVal;
                    }
                    if (hslMap[key]) {
                        this.params[hslMap[key]] = defaultVal;
                    }
                    const display = this.overlay.querySelector(`#val-hsl-${key}`);
                    if (display) display.textContent = defaultVal;
                }
                this.requestRender();
                this.pushHistory();
            };
        });
    }

    cloneHSLAdjustments(source = this.hslAdjustments) {
        const clone = {};
        Object.keys(source || {}).forEach(key => {
            clone[key] = { ...(source[key] || { h: 0, s: 0, l: 0 }) };
        });
        return clone;
    }

    getDefaultHSLAdjustments() {
        const defaults = {};
        HSL_COLORS.forEach(color => {
            defaults[color.id] = { h: 0, s: 0, l: 0 };
        });
        return defaults;
    }

    hasHSLAdjustments() {
        return Object.keys(this.hslAdjustments || {}).some(key => {
            const adj = this.hslAdjustments[key];
            return adj && (adj.h || adj.s || adj.l);
        });
    }

    shouldApplyPixelEffects() {
        const p = this.params;
        const totalNoise = Math.max(0, (p.noise || 0) + (p.grain || 0));
        return totalNoise > 0 || this.hasHSLAdjustments() || p.clarity !== 0 || p.dehaze !== 0 || p.highlight !== 0 || p.shadow !== 0 || (this.curveEditor?.hasAdjustments() ?? false);
    }

    loadImage() {
        this.originalImage = new Image();
        this.originalImage.onload = () => {
            this.currentImage = this.originalImage;
            this.fitCanvas();
            this.syncHSLSliders();
            this.updateHSLUI();
            this.pushHistory(); // Initial state
        };
        this.originalImage.src = this.imageSrc;
    }

    fitCanvas() {
        if (!this.currentImage) return;
        const containerW = this.container.clientWidth - 40;
        const containerH = this.container.clientHeight - 40;
        const scale = Math.min(containerW / this.currentImage.width, containerH / this.currentImage.height);
        this.zoom = scale;
        this.pan = { x: 0, y: 0 }; // Center
        this.updateZoomDisplay();
        this.requestRender();
    }

    updateZoomDisplay() {
        this.overlay.querySelector("#zoom-level").textContent = Math.round(this.zoom * 100) + "%";
    }

    toggleMode(mode) {
        this.isCropping = mode === 'crop';
        
        // Update UI
        this.overlay.querySelectorAll(".apix-mode-btn").forEach(b => b.classList.remove("active"));
        this.overlay.querySelector(`#tool-${mode}`).classList.add("active");
        
        // Show/Hide Crop Controls
        const cropPanel = this.overlay.querySelector("#panel-crop-controls");
        // FIXED: Do not hide parent element, just toggle the panel content
        
        if (mode === 'crop') {
            cropPanel.classList.remove("hidden");
            cropPanel.scrollIntoView({ behavior: 'smooth' });
        } else {
            cropPanel.classList.add("hidden");
        }

        this.container.style.cursor = this.isCropping ? 'crosshair' : 'grab';
        this.cropBox.style.display = 'none';
        this.cropStart = null;
        this.cropRect = null;
    }

    // --- Rendering ---

    requestRender() {
        if (!this.renderRequested) {
            this.renderRequested = true;
            requestAnimationFrame(() => {
                this.render();
                this.renderRequested = false;
            });
        }
    }

    render() {
        if (!this.currentImage) return;

        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        this.canvas.width = w;
        this.canvas.height = h;
        
        // Clear
        this.ctx.clearRect(0, 0, w, h);
        
        // Calculate transformed position
        const imgW = this.currentImage.width * this.zoom;
        const imgH = this.currentImage.height * this.zoom;
        const centerX = w / 2 + this.pan.x;
        const centerY = h / 2 + this.pan.y;
        const x = centerX - imgW / 2;
        const y = centerY - imgH / 2;

        // Save context for transforms
        this.ctx.save();
        
        // 1. Apply Filters (CSS style for preview performance)
        // Note: Canvas filter API is widely supported now
        const p = this.params;
        const clarityBoost = 1 + (p.clarity || 0) / 200;
        const dehazeBoost = 1 + Math.max(0, p.dehaze || 0) / 200;
        const brightness = 100 + p.exposure;
        const contrast = Math.max(0, (100 + p.contrast) * clarityBoost * dehazeBoost);
        let saturate = 100 + p.saturation + (p.vibrance * 0.5);
        if (p.dehaze > 0) {
            saturate += p.dehaze * 0.3;
        }
        const hue = p.hue;
        const blur = p.blur / 5; // Scale down
        
        let filterString = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%) hue-rotate(${hue}deg)`;
        if (blur > 0) filterString += ` blur(${blur}px)`;
        
        this.ctx.filter = filterString;
        
        const drawX = x;
        const drawY = y;
        const drawW = imgW;
        const drawH = imgH;
        this.ctx.drawImage(this.currentImage, drawX, drawY, drawW, drawH);
        this.ctx.filter = 'none';

        const rect = { x: drawX, y: drawY, width: drawW, height: drawH };

        // 2. Overlays (Temp/Tint)
        if (p.temp !== 0 || p.tint !== 0) {
            this.ctx.globalCompositeOperation = 'overlay';
            
            // Temp (Blue/Orange)
            if (p.temp !== 0) {
                this.ctx.fillStyle = p.temp > 0 ? `rgba(255, 160, 0, ${p.temp / 200})` : `rgba(0, 100, 255, ${Math.abs(p.temp) / 200})`;
                this.ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
            }
            
            // Tint (Green/Magenta)
            if (p.tint !== 0) {
                this.ctx.fillStyle = p.tint > 0 ? `rgba(255, 0, 255, ${p.tint / 200})` : `rgba(0, 255, 0, ${Math.abs(p.tint) / 200})`;
                this.ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
            }

            this.ctx.globalCompositeOperation = 'source-over';
        }

        if (this.shouldApplyPixelEffects()) {
            this.applyPixelEffectsRegion(this.ctx, rect.x, rect.y, rect.width, rect.height);
        }

        this.ctx.restore();
    }

    flipImage(direction) {
        if (!this.currentImage) return;
        const canvas = document.createElement("canvas");
        canvas.width = this.currentImage.width;
        canvas.height = this.currentImage.height;
        const ctx = canvas.getContext("2d");
        ctx.save();
        if (direction === "horizontal") {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        } else {
            ctx.translate(0, canvas.height);
            ctx.scale(1, -1);
        }
        ctx.drawImage(this.currentImage, 0, 0);
        ctx.restore();

        const flipped = new Image();
        flipped.onload = () => {
            this.currentImage = flipped;
            this.requestRender();
            this.pushHistory();
        };
        flipped.src = canvas.toDataURL();
    }

    rotateImage(angle = 90) {
        if (!this.currentImage) return;
        let normalized = angle % 360;
        if (normalized < 0) normalized += 360;
        if (normalized === 0) return;

        const imgW = this.currentImage.width;
        const imgH = this.currentImage.height;
        const needsSwap = normalized === 90 || normalized === 270;

        const canvas = document.createElement("canvas");
        canvas.width = needsSwap ? imgH : imgW;
        canvas.height = needsSwap ? imgW : imgH;
        const ctx = canvas.getContext("2d");
        ctx.save();

        if (normalized === 90) {
            ctx.translate(canvas.width, 0);
            ctx.rotate(Math.PI / 2);
            ctx.drawImage(this.currentImage, 0, 0);
        } else if (normalized === 180) {
            ctx.translate(canvas.width, canvas.height);
            ctx.rotate(Math.PI);
            ctx.drawImage(this.currentImage, 0, 0);
        } else if (normalized === 270) {
            ctx.translate(0, canvas.height);
            ctx.rotate(-Math.PI / 2);
            ctx.drawImage(this.currentImage, 0, 0);
        } else {
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate((Math.PI / 180) * normalized);
            ctx.drawImage(this.currentImage, -imgW / 2, -imgH / 2);
        }

        ctx.restore();

        const rotated = new Image();
        rotated.onload = () => {
            this.currentImage = rotated;
            this.requestRender();
            this.pushHistory();
        };
        rotated.src = canvas.toDataURL();
    }

    applyPixelEffectsRegion(ctx, x, y, width, height) {
        const p = this.params;
        const totalNoise = Math.max(0, (p.noise || 0) + (p.grain || 0));
        const needsProcessing = totalNoise > 0 || this.hasHSLAdjustments() || p.clarity !== 0 || p.dehaze !== 0 || p.highlight !== 0 || p.shadow !== 0 || (this.curveEditor?.hasAdjustments() ?? false);
        if (!needsProcessing) return;
        if (width <= 0 || height <= 0) return;

        const startX = Math.max(0, Math.floor(x));
        const startY = Math.max(0, Math.floor(y));
        const endX = Math.min(ctx.canvas.width, Math.ceil(x + width));
        const endY = Math.min(ctx.canvas.height, Math.ceil(y + height));
        const regionW = endX - startX;
        const regionH = endY - startY;
        if (regionW <= 0 || regionH <= 0) return;

        let imageData;
        try {
            imageData = ctx.getImageData(startX, startY, regionW, regionH);
        } catch (err) {
            console.warn("ImageEditor: unable to read pixels for adjustments", err);
            return;
        }

        const data = imageData.data;
        const curvePack = this.curveEditor?.getLUTPack?.();
        const curvesActive = curvePack?.hasAdjustments;
        const curveRGB = curvesActive ? curvePack.rgb : null;
        const curveR = curvesActive ? curvePack.r : null;
        const curveG = curvesActive ? curvePack.g : null;
        const curveB = curvesActive ? curvePack.b : null;
        const clarityStrength = (p.clarity || 0) / 200;
        const dehazeStrength = (p.dehaze || 0) / 200;
        const highlightStrength = (p.highlight || 0) / 100;
        const shadowStrength = (p.shadow || 0) / 100;
        const noiseStrength = totalNoise / 100 * 30;

        for (let i = 0; i < data.length; i += 4) {
            let r = data[i];
            let g = data[i + 1];
            let b = data[i + 2];
            let { h, s, l } = rgbToHsl(r, g, b);

            const adjustment = this.getHSLAdjustmentForHue(h);
            const hueShift = (adjustment.h || 0) / 360;
            const satAdjust = (adjustment.s || 0) / 100;
            const lightAdjust = (adjustment.l || 0) / 100;

            if (hueShift) {
                h = (h + hueShift) % 1;
                if (h < 0) h += 1;
            }
            if (satAdjust) {
                if (satAdjust > 0) {
                    s = clamp01(s + (1 - s) * satAdjust);
                } else {
                    s = clamp01(s + s * satAdjust);
                }
            }
            if (lightAdjust) {
                if (lightAdjust > 0) {
                    l = clamp01(l + (1 - l) * lightAdjust);
                } else {
                    l = clamp01(l + l * lightAdjust);
                }
            }
            if (clarityStrength) {
                const delta = (l - 0.5) * clarityStrength;
                l = clamp01(l + delta);
            }
            if (dehazeStrength) {
                if (dehazeStrength > 0) {
                    l = clamp01(l - (l - 0.4) * Math.abs(dehazeStrength));
                    s = clamp01(s + (1 - s) * Math.abs(dehazeStrength) * 0.8);
                } else {
                    const haze = Math.abs(dehazeStrength);
                    l = clamp01(l + (1 - l) * haze * 0.5);
                    s = clamp01(s - s * haze * 0.5);
                }
            }
            if (highlightStrength && l > 0.5) {
                const influence = (l - 0.5) * 2;
                l = clamp01(l + influence * highlightStrength);
            }
            if (shadowStrength && l < 0.5) {
                const influence = (0.5 - l) * 2;
                l = clamp01(l + influence * shadowStrength);
            }

            ({ r, g, b } = hslToRgb(h, s, l));

            if (noiseStrength > 0) {
                const rand = (Math.random() - 0.5) * 2 * noiseStrength;
                r = clamp255(r + rand);
                g = clamp255(g + rand);
                b = clamp255(b + rand);
            }

            if (curvesActive) {
                if (curveR) r = curveR[r];
                if (curveG) g = curveG[g];
                if (curveB) b = curveB[b];
                if (curveRGB) {
                    r = curveRGB[r];
                    g = curveRGB[g];
                    b = curveRGB[b];
                }
            }

            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
        }

        ctx.putImageData(imageData, startX, startY);
    }

    getHSLAdjustmentForHue(hueValue) {
        const adjustments = this.hslAdjustments || {};
        const result = { h: 0, s: 0, l: 0 };

        HSL_COLORS.forEach(color => {
            const adj = adjustments[color.id];
            if (!adj || color.center === null) return;
            const dist = hueDistance(hueValue, color.center);
            const width = color.width || 0.08;
            const maxDist = width * 2;
            if (dist >= maxDist) return;
            const normalized = dist / width;
            const influence = Math.exp(-normalized * normalized * 1.5);
            if (influence <= 0) return;
            result.h += adj.h * influence;
            result.s += adj.s * influence;
            result.l += adj.l * influence;
        });

        return result;
    }

    // --- Crop Logic ---
    handleCropStart(e) {
        const rect = this.container.getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;
        
        // Check if clicking on a handle
        if (e.target.classList.contains('apix-crop-handle')) {
            this.activeHandle = e.target.dataset.handle;
            this.cropStart = { x: clientX, y: clientY }; // Reference for drag
            // Store initial rect state for resizing
            const style = window.getComputedStyle(this.cropBox);
            this.initialCropRect = {
                left: parseFloat(style.left),
                top: parseFloat(style.top),
                width: parseFloat(style.width),
                height: parseFloat(style.height)
            };
            return;
        }

        // Check if clicking inside existing crop box (Move)
        if (this.cropRect) {
            const style = window.getComputedStyle(this.cropBox);
            const left = parseFloat(style.left);
            const top = parseFloat(style.top);
            const width = parseFloat(style.width);
            const height = parseFloat(style.height);
            
            if (clientX >= left && clientX <= left + width && clientY >= top && clientY <= top + height) {
                this.activeHandle = 'move';
                this.cropStart = { x: clientX, y: clientY };
                this.initialCropRect = { left, top, width, height };
                return;
            }
        }

        // Start new crop
        // Convert to image coordinates to check bounds
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        const imgW = this.currentImage.width * this.zoom;
        const imgH = this.currentImage.height * this.zoom;
        const centerX = w / 2 + this.pan.x;
        const centerY = h / 2 + this.pan.y;
        const imgX = centerX - imgW / 2;
        const imgY = centerY - imgH / 2;

        // Check if click is within image
        if (clientX < imgX || clientX > imgX + imgW || clientY < imgY || clientY > imgY + imgH) return;

        this.cropStart = { x: clientX, y: clientY };
        this.cropBox.style.display = 'block';
        this.activeHandle = 'new';
        this.updateCropBox(clientX, clientY, 0, 0);
    }

    handleCropMove(e) {
        if (!this.cropStart) return;

        const rect = this.container.getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;
        
        if (this.activeHandle === 'new') {
            const w = clientX - this.cropStart.x;
            const h = clientY - this.cropStart.y;
            this.updateCropBox(this.cropStart.x, this.cropStart.y, w, h);
        } else if (this.activeHandle === 'move') {
            const dx = clientX - this.cropStart.x;
            const dy = clientY - this.cropStart.y;
            this.cropBox.style.left = (this.initialCropRect.left + dx) + 'px';
            this.cropBox.style.top = (this.initialCropRect.top + dy) + 'px';
        } else if (this.activeHandle) {
            // Resize logic
            const dx = clientX - this.cropStart.x;
            const dy = clientY - this.cropStart.y;
            let newLeft = this.initialCropRect.left;
            let newTop = this.initialCropRect.top;
            let newWidth = this.initialCropRect.width;
            let newHeight = this.initialCropRect.height;

            if (this.activeHandle.includes('l')) {
                newLeft += dx;
                newWidth -= dx;
            }
            if (this.activeHandle.includes('r')) {
                newWidth += dx;
            }
            if (this.activeHandle.includes('t')) {
                newTop += dy;
                newHeight -= dy;
            }
            if (this.activeHandle.includes('b')) {
                newHeight += dy;
            }
            
            // Enforce Aspect Ratio if set
            const aspectSelect = this.overlay.querySelector("#crop-aspect");
            if (aspectSelect.value !== 'free') {
                const ratio = parseFloat(aspectSelect.value);
                // Simple aspect enforcement (width dominant)
                 if (this.activeHandle.includes('l') || this.activeHandle.includes('r')) {
                     newHeight = newWidth / ratio;
                 } else {
                     newWidth = newHeight * ratio;
                 }
            }

            if (newWidth > 10 && newHeight > 10) {
                this.cropBox.style.left = newLeft + 'px';
                this.cropBox.style.top = newTop + 'px';
                this.cropBox.style.width = newWidth + 'px';
                this.cropBox.style.height = newHeight + 'px';
            }
        }
    }

    handleCropEnd() {
        // Finalize crop box dimensions
        const style = window.getComputedStyle(this.cropBox);
        this.cropRect = {
            x: parseFloat(style.left),
            y: parseFloat(style.top),
            w: parseFloat(style.width),
            h: parseFloat(style.height)
        };
        this.cropStart = null;
        this.activeHandle = null;
    }

    updateCropBox(x, y, w, h) {
        let left = w < 0 ? x + w : x;
        let top = h < 0 ? y + h : y;
        let width = Math.abs(w);
        let height = Math.abs(h);
        
        // Constrain to aspect ratio if selected
        const aspectSelect = this.overlay.querySelector("#crop-aspect");
        if (aspectSelect.value !== 'free') {
            const ratio = parseFloat(aspectSelect.value);
            if (width / height > ratio) {
                width = height * ratio;
            } else {
                height = width / ratio;
            }
        }

        this.cropBox.style.left = left + 'px';
        this.cropBox.style.top = top + 'px';
        this.cropBox.style.width = width + 'px';
        this.cropBox.style.height = height + 'px';
    }

    applyCrop() {
        if (!this.cropRect || this.cropRect.w < 10) return;

        // Convert screen coords to image coords
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        const imgW = this.currentImage.width * this.zoom;
        const imgH = this.currentImage.height * this.zoom;
        const centerX = w / 2 + this.pan.x;
        const centerY = h / 2 + this.pan.y;
        const imgX = centerX - imgW / 2;
        const imgY = centerY - imgH / 2;

        const relativeX = (this.cropRect.x - imgX) / this.zoom;
        const relativeY = (this.cropRect.y - imgY) / this.zoom;
        const relativeW = this.cropRect.w / this.zoom;
        const relativeH = this.cropRect.h / this.zoom;

        // Create new cropped image
        const canvas = document.createElement('canvas');
        canvas.width = relativeW;
        canvas.height = relativeH;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(this.currentImage, relativeX, relativeY, relativeW, relativeH, 0, 0, relativeW, relativeH);

        const newImg = new Image();
        newImg.onload = () => {
            this.currentImage = newImg;
            this.toggleMode('adjust');
            this.fitCanvas();
            this.pushHistory();
        };
        newImg.src = canvas.toDataURL();
    }

    // --- History ---
    pushHistory() {
        // Remove future states if we are in middle of stack
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }
        
        // Save state
        this.history.push({
            params: { ...this.params },
            hslAdjustments: this.cloneHSLAdjustments(),
            activeHSLColor: this.activeHSLColor,
            curves: this.curveEditor ? this.curveEditor.getState() : null,
            image: this.currentImage.src // Save image source (base64) if changed by crop
        });
        this.historyIndex++;
        this.updateHistoryButtons();
    }

    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.restoreState(this.history[this.historyIndex]);
        }
    }

    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.restoreState(this.history[this.historyIndex]);
        }
    }

    restoreState(state) {
        this.params = { ...state.params };
        this.hslAdjustments = state.hslAdjustments ? this.cloneHSLAdjustments(state.hslAdjustments) : this.getDefaultHSLAdjustments();
        this.activeHSLColor = state.activeHSLColor || HSL_COLORS[0]?.id || null;
        this.syncHSLSliders();
        this.updateHSLUI();
        if (this.curveEditor) {
            if (state.curves) {
                this.curveEditor.setState(state.curves);
            } else {
                this.curveEditor.resetAll(false);
            }
        }
        // Update UI
        Object.keys(this.params).forEach(key => {
            const el = this.overlay.querySelector(`#param-${key}`);
            if (el) {
                el.value = this.params[key];
                this.overlay.querySelector(`#val-${key}`).textContent = this.params[key];
            }
        });
        
        // Update Image if changed (crop)
        if (state.image !== this.currentImage.src) {
            const img = new Image();
            img.onload = () => {
                this.currentImage = img;
                this.requestRender();
            };
            img.src = state.image;
        } else {
            this.requestRender();
        }
        this.updateHistoryButtons();
    }

    updateHistoryButtons() {
        this.overlay.querySelector("#action-undo").disabled = this.historyIndex <= 0;
        this.overlay.querySelector("#action-redo").disabled = this.historyIndex >= this.history.length - 1;
    }

    reset() {
        // Reset to initial state (index 0)
        if (this.history.length > 0) {
            this.historyIndex = 0;
            this.restoreState(this.history[0]);
            // Clear future
            this.history = [this.history[0]];
            this.updateHistoryButtons();
        }
    }

    async renderEditedBlob() {
        // 1. Create a high-res canvas
        const canvas = document.createElement("canvas");
        canvas.width = this.currentImage.width;
        canvas.height = this.currentImage.height;
        const ctx = canvas.getContext("2d");

        // 2. Apply filters
        const p = this.params;
        const clarityBoost = 1 + (p.clarity || 0) / 200;
        const dehazeBoost = 1 + Math.max(0, p.dehaze || 0) / 200;
        const brightness = 100 + p.exposure;
        const contrast = Math.max(0, (100 + p.contrast) * clarityBoost * dehazeBoost);
        let saturate = 100 + p.saturation + (p.vibrance * 0.5);
        if (p.dehaze > 0) {
            saturate += p.dehaze * 0.3;
        }
        const hue = p.hue;
        const blur = p.blur / 5; // Scale appropriately for full res? 
        // Note: CSS blur is px based, canvas filter blur is also px based. 
        // If image is large, blur needs to be scaled up to look same as preview.
        // Preview zoom = this.zoom.
        // Real blur = p.blur / 5 / this.zoom (approx)
        
        let filterString = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%) hue-rotate(${hue}deg)`;
        if (blur > 0) filterString += ` blur(${blur}px)`;
        
        ctx.filter = filterString;
        ctx.drawImage(this.currentImage, 0, 0);
        ctx.filter = 'none';

        // 3. Apply Overlays
        if (p.temp !== 0 || p.tint !== 0) {
            ctx.globalCompositeOperation = 'overlay';
            if (p.temp !== 0) {
                ctx.fillStyle = p.temp > 0 ? `rgba(255, 160, 0, ${p.temp / 200})` : `rgba(0, 100, 255, ${Math.abs(p.temp) / 200})`;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            if (p.tint !== 0) {
                ctx.fillStyle = p.tint > 0 ? `rgba(255, 0, 255, ${p.tint / 200})` : `rgba(0, 255, 0, ${Math.abs(p.tint) / 200})`;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            ctx.globalCompositeOperation = 'source-over';
        }

        if (this.shouldApplyPixelEffects()) {
            this.applyPixelEffectsRegion(ctx, 0, 0, canvas.width, canvas.height);
        }

        return new Promise((resolve, reject) => {
            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error("Unable to export edited image."));
                    }
                },
                "image/png",
                0.95
            );
        });
    }

    // --- Save ---
    async save() {
        try {
            const blob = await this.renderEditedBlob();
            if (this.saveCallback) {
                await this.saveCallback(blob);
            }
            this.close();
        } catch (err) {
            console.error("[SDVN.ImageEditor] Failed to save image", err);
        }
    }

    async download() {
        try {
            const blob = await this.renderEditedBlob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = this.buildDownloadFilename();
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 0);
        } catch (err) {
            console.error("[SDVN.ImageEditor] Failed to download image", err);
        }
    }

    buildDownloadFilename() {
        const fallback = "sdvn_image.png";
        if (!this.imageSrc) return fallback;
        try {
            const url = new URL(this.imageSrc, window.location.origin);
            const paramName = url.searchParams.get("filename");
            const pathName = url.pathname.split("/").pop();
            const base = (paramName || pathName || "sdvn_image").replace(/\.[^.]+$/, "");
            return `${base || "sdvn_image"}_edited.png`;
        } catch {
            const sanitized = this.imageSrc.split("/").pop()?.split("?")[0] ?? "sdvn_image";
            const base = sanitized.replace(/\.[^.]+$/, "");
            return `${base || "sdvn_image"}_edited.png`;
        }
    }

    close() {
        this.curveEditor?.destroy?.();
        document.body.removeChild(this.overlay);
    }
}
