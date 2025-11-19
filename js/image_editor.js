import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

// --- Styles ---
const style = document.createElement("style");
style.textContent = `
    :root {
        --apix-bg: #0f0f0f;
        --apix-panel: #1a1a1a;
        --apix-border: #2a2a2a;
        --apix-text: #e0e0e0;
        --apix-text-dim: #888;
        --apix-accent: #f5c518; /* Yellow accent from apix */
        --apix-accent-hover: #ffd54f;
        --apix-danger: #ff4444;
    }
    .apix-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: var(--apix-bg);
        z-index: 10000;
        display: flex;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        color: var(--apix-text);
        overflow: hidden;
        user-select: none;
    }
    
    /* Left Sidebar (Tools) */
    .apix-sidebar-left {
        width: 60px;
        background: var(--apix-panel);
        border-right: 1px solid var(--apix-border);
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 20px 0;
        gap: 15px;
        z-index: 10;
    }
    
    /* Main Canvas Area */
    .apix-main-area {
        flex: 1;
        display: flex;
        flex-direction: column;
        position: relative;
        background: #000;
        overflow: hidden;
    }
    .apix-header {
        height: 50px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 20px;
        background: var(--apix-panel);
        border-bottom: 1px solid var(--apix-border);
    }
    .apix-header-title {
        font-weight: 700;
        color: var(--apix-accent);
        font-size: 18px;
        display: flex;
        align-items: center;
        gap: 10px;
    }
    
    .apix-canvas-container {
        flex: 1;
        position: relative;
        overflow: hidden;
        display: flex;
        justify-content: center;
        align-items: center;
        cursor: grab;
    }
    .apix-canvas-container:active {
        cursor: grabbing;
    }
    
    /* Bottom Bar (Zoom) */
    .apix-bottom-bar {
        height: 40px;
        background: var(--apix-panel);
        border-top: 1px solid var(--apix-border);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 15px;
        font-size: 12px;
    }
    
    /* Right Sidebar (Adjustments) */
    .apix-sidebar-right {
        width: 320px;
        background: var(--apix-panel);
        border-left: 1px solid var(--apix-border);
        display: flex;
        flex-direction: column;
        z-index: 10;
    }
    
    /* UI Components */
    .apix-tool-btn {
        width: 40px;
        height: 40px;
        border-radius: 8px;
        border: 1px solid transparent;
        background: transparent;
        color: var(--apix-text-dim);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    }
    .apix-tool-btn:hover {
        color: var(--apix-text);
        background: rgba(255,255,255,0.05);
    }
    .apix-tool-btn.active {
        color: #000;
        background: var(--apix-accent);
    }
    
    .apix-panel-section {
        border-bottom: 1px solid var(--apix-border);
    }
    .apix-panel-header {
        padding: 15px;
        font-weight: 600;
        font-size: 13px;
        cursor: pointer;
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: rgba(255,255,255,0.02);
        user-select: none;
    }
    .apix-panel-header:hover {
        background: rgba(255,255,255,0.05);
    }
    .apix-panel-content {
        padding: 15px;
        display: flex;
        flex-direction: column;
        gap: 15px;
    }
    .apix-panel-content.hidden {
        display: none;
    }
    
    .apix-control-row {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .apix-control-label {
        display: flex;
        justify-content: space-between;
        font-size: 11px;
        color: var(--apix-text-dim);
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    
    .apix-slider {
        -webkit-appearance: none;
        width: 100%;
        height: 4px;
        background: #333;
        border-radius: 2px;
        outline: none;
    }
    .apix-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: var(--apix-accent);
        cursor: pointer;
        border: 2px solid #1a1a1a;
        transition: transform 0.1s;
    }
    .apix-slider::-webkit-slider-thumb:hover {
        transform: scale(1.2);
    }
    
    .apix-btn {
        padding: 8px 16px;
        border-radius: 6px;
        border: none;
        font-weight: 600;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.2s;
    }
    .apix-btn-primary {
        background: var(--apix-accent);
        color: #000;
    }
    .apix-btn-primary:hover {
        background: var(--apix-accent-hover);
    }
    .apix-btn-secondary {
        background: #333;
        color: #fff;
    }
    .apix-btn-secondary:hover {
        background: #444;
    }
    
    .apix-footer {
        margin-top: auto;
        padding: 20px;
        border-top: 1px solid var(--apix-border);
        display: flex;
        justify-content: flex-end;
        gap: 10px;
    }

    /* Crop Overlay */
    .apix-crop-overlay {
        position: absolute;
        border: 1px solid rgba(255, 255, 255, 0.5);
        box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.7);
        pointer-events: none;
        display: none;
    }
    .apix-crop-handle {
        position: absolute;
        width: 12px;
        height: 12px;
        background: var(--apix-accent);
        border: 1px solid #000;
        pointer-events: auto;
        z-index: 100;
    }
    /* Handle positions */
    .handle-tl { top: -6px; left: -6px; cursor: nw-resize; }
    .handle-tr { top: -6px; right: -6px; cursor: ne-resize; }
    .handle-bl { bottom: -6px; left: -6px; cursor: sw-resize; }
    .handle-br { bottom: -6px; right: -6px; cursor: se-resize; }
    /* Edges */
    .handle-t { top: -6px; left: 50%; transform: translateX(-50%); cursor: n-resize; }
    .handle-b { bottom: -6px; left: 50%; transform: translateX(-50%); cursor: s-resize; }
    .handle-l { left: -6px; top: 50%; transform: translateY(-50%); cursor: w-resize; }
    .handle-r { right: -6px; top: 50%; transform: translateY(-50%); cursor: e-resize; }
`;
document.head.appendChild(style);

// --- Icons ---
const ICONS = {
    crop: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"></path><path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"></path></svg>`,
    adjust: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
    undo: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v6h6"></path><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path></svg>`,
    redo: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 7v6h-6"></path><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"></path></svg>`,
    chevronDown: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>`,
    close: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`
};

class ImageEditor {
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
            sharpen: 0,     // 0 to 100
            noise: 0        // 0 to 100
        };

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
                <button class="apix-tool-btn active" id="tool-adjust" title="Adjustments">${ICONS.adjust}</button>
                <button class="apix-tool-btn" id="tool-crop" title="Crop">${ICONS.crop}</button>
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
                        <button class="apix-btn apix-btn-secondary" id="action-reset">Reset</button>
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

                <!-- Detail -->
                <div class="apix-panel-section">
                    <div class="apix-panel-header" data-target="panel-detail">
                        <span>Detail</span>
                        ${ICONS.chevronDown}
                    </div>
                    <div class="apix-panel-content" id="panel-detail">
                        ${this.renderSlider("Sharpen", "sharpen", 0, 100, 0)}
                        ${this.renderSlider("Blur", "blur", 0, 100, 0)}
                        ${this.renderSlider("Noise", "noise", 0, 100, 0)}
                    </div>
                </div>
                
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

                <div class="apix-footer">
                    <button class="apix-btn apix-btn-secondary" id="action-close">Cancel</button>
                    <button class="apix-btn apix-btn-primary" id="action-save">Save Image</button>
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
                    <span id="val-${id}">${val}</span>
                </div>
                <input type="range" class="apix-slider" id="param-${id}" min="${min}" max="${max}" value="${val}">
            </div>
        `;
    }

    bindEvents() {
        this.canvas = this.overlay.querySelector("#editor-canvas");
        this.ctx = this.canvas.getContext("2d");
        this.container = this.overlay.querySelector("#canvas-container");
        this.cropBox = this.overlay.querySelector("#crop-box");

        // Sliders
        Object.keys(this.params).forEach(key => {
            const slider = this.overlay.querySelector(`#param-${key}`);
            slider.oninput = (e) => {
                const val = parseInt(e.target.value);
                this.params[key] = val;
                this.overlay.querySelector(`#val-${key}`).textContent = val;
                this.requestRender();
            };
            slider.onchange = () => this.pushHistory(); // Save state on release
        });

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

        // Main Actions
        this.overlay.querySelector("#action-close").onclick = () => this.close();
        this.overlay.querySelector("#action-save").onclick = () => this.save();
        this.overlay.querySelector("#action-reset").onclick = () => this.reset();
        this.overlay.querySelector("#action-undo").onclick = () => this.undo();
        this.overlay.querySelector("#action-redo").onclick = () => this.redo();
    }

    loadImage() {
        this.originalImage = new Image();
        this.originalImage.onload = () => {
            this.currentImage = this.originalImage;
            this.fitCanvas();
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
        this.overlay.querySelectorAll(".apix-tool-btn").forEach(b => b.classList.remove("active"));
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
        const brightness = 100 + p.exposure;
        const contrast = 100 + p.contrast;
        const saturate = 100 + p.saturation + (p.vibrance * 0.5);
        const hue = p.hue;
        const blur = p.blur / 5; // Scale down
        
        let filterString = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%) hue-rotate(${hue}deg)`;
        if (blur > 0) filterString += ` blur(${blur}px)`;
        
        this.ctx.filter = filterString;
        
        this.ctx.drawImage(this.currentImage, x, y, imgW, imgH);
        this.ctx.filter = 'none';

        // 2. Overlays (Temp/Tint)
        if (p.temp !== 0 || p.tint !== 0 || p.highlight !== 0 || p.shadow !== 0) {
            this.ctx.globalCompositeOperation = 'overlay';
            
            // Temp (Blue/Orange)
            if (p.temp !== 0) {
                this.ctx.fillStyle = p.temp > 0 ? `rgba(255, 160, 0, ${p.temp / 200})` : `rgba(0, 100, 255, ${Math.abs(p.temp) / 200})`;
                this.ctx.fillRect(x, y, imgW, imgH);
            }
            
            // Tint (Green/Magenta)
            if (p.tint !== 0) {
                this.ctx.fillStyle = p.tint > 0 ? `rgba(255, 0, 255, ${p.tint / 200})` : `rgba(0, 255, 0, ${Math.abs(p.tint) / 200})`;
                this.ctx.fillRect(x, y, imgW, imgH);
            }

            // Highlight/Shadow (Simple approximation)
            // Ideally this needs curve manipulation, but overlay works for basic adjustments
            if (p.highlight !== 0) {
                this.ctx.globalCompositeOperation = p.highlight > 0 ? 'screen' : 'multiply';
                this.ctx.fillStyle = `rgba(255,255,255,${Math.abs(p.highlight)/200})`;
                this.ctx.fillRect(x, y, imgW, imgH);
            }
            
            this.ctx.globalCompositeOperation = 'source-over';
        }
        
        // 3. Noise (Grain) - Simplified
        if (p.noise > 0) {
            // Drawing noise on top is expensive every frame, maybe skip for preview or use a pattern
            // For now, skip in preview for performance
        }

        this.ctx.restore();
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

    // --- Save ---
    async save() {
        // 1. Create a high-res canvas
        const canvas = document.createElement("canvas");
        canvas.width = this.currentImage.width;
        canvas.height = this.currentImage.height;
        const ctx = canvas.getContext("2d");

        // 2. Apply filters
        const p = this.params;
        const brightness = 100 + p.exposure;
        const contrast = 100 + p.contrast;
        const saturate = 100 + p.saturation + (p.vibrance * 0.5);
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
        if (p.temp !== 0 || p.tint !== 0 || p.highlight !== 0 || p.shadow !== 0) {
            ctx.globalCompositeOperation = 'overlay';
            if (p.temp !== 0) {
                ctx.fillStyle = p.temp > 0 ? `rgba(255, 160, 0, ${p.temp / 200})` : `rgba(0, 100, 255, ${Math.abs(p.temp) / 200})`;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            if (p.tint !== 0) {
                ctx.fillStyle = p.tint > 0 ? `rgba(255, 0, 255, ${p.tint / 200})` : `rgba(0, 255, 0, ${Math.abs(p.tint) / 200})`;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            if (p.highlight !== 0) {
                ctx.globalCompositeOperation = p.highlight > 0 ? 'screen' : 'multiply';
                ctx.fillStyle = `rgba(255,255,255,${Math.abs(p.highlight)/200})`;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            ctx.globalCompositeOperation = 'source-over';
        }

        // 4. Noise (Optional, implement if needed)
        if (p.noise > 0) {
            // Generate noise
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            const factor = p.noise / 100 * 255 * 0.1; // Strength
            for (let i = 0; i < data.length; i += 4) {
                const rand = (0.5 - Math.random()) * factor;
                data[i] += rand;
                data[i+1] += rand;
                data[i+2] += rand;
            }
            ctx.putImageData(imageData, 0, 0);
        }

        canvas.toBlob(async (blob) => {
            if (this.saveCallback) {
                await this.saveCallback(blob);
                this.close();
            }
        }, "image/png");
    }

    close() {
        document.body.removeChild(this.overlay);
    }
}

const IMAGE_EDITOR_SUBFOLDER = "image_editor";

function buildImageReference(data, fallback = {}) {
    const ref = {
        filename: data?.name || data?.filename || fallback.filename,
        subfolder: data?.subfolder ?? fallback.subfolder ?? "",
        type: data?.type || fallback.type || "input",
    };
    if (!ref.filename) {
        return null;
    }
    return ref;
}

function buildAnnotatedLabel(ref) {
    if (!ref?.filename) return "";
    const path = ref.subfolder ? `${ref.subfolder}/${ref.filename}` : ref.filename;
    return `${path} [${ref.type || "input"}]`;
}

function parseImageWidgetValue(value) {
    const defaults = { filename: null, subfolder: "", type: "input" };
    if (!value) return defaults;
    if (typeof value === "object") {
        return {
            filename: value.filename || null,
            subfolder: value.subfolder || "",
            type: value.type || "input",
        };
    }

    const raw = value.toString().trim();
    let type = "input";
    let path = raw;
    const match = raw.match(/\[([^\]]+)\]\s*$/);
    if (match) {
        type = match[1].trim() || "input";
        path = raw.slice(0, match.index).trim();
    }
    path = path.replace(/^[\\/]+/, "");
    const parts = path.split(/[\\/]/).filter(Boolean);
    const filename = parts.pop() || null;
    const subfolder = parts.join("/") || "";
    return { filename, subfolder, type };
}

function sanitizeFilenamePart(part) {
    return (part || "")
        .replace(/[\\/]/g, "_")
        .replace(/[<>:"|?*\x00-\x1F]/g, "_")
        .replace(/\s+/g, "_");
}

function buildEditorFilename(sourceName) {
    let name = sourceName ? sourceName.toString() : "";
    name = name.split(/[\\/]/).pop() || "";
    name = name.replace(/\.[^.]+$/, "");
    name = sanitizeFilenamePart(name);
    if (!name) name = `image_${Date.now()}`;
    return `${name}.png`;
}

function extractFilenameFromSrc(src) {
    if (!src) return null;
    try {
        const url = new URL(src, window.location.origin);
        return url.searchParams.get("filename");
    } catch {
        return null;
    }
}

function formatWidgetValueFromRef(ref, currentValue) {
    if (currentValue && typeof currentValue === "object") {
        return {
            ...currentValue,
            filename: ref.filename,
            subfolder: ref.subfolder,
            type: ref.type,
        };
    }
    return buildAnnotatedLabel(ref);
}

function updateWidgetWithRef(node, widget, ref) {
    if (!node || !widget || !ref) return;
    const annotatedLabel = buildAnnotatedLabel(ref);
    const storedValue = formatWidgetValueFromRef(ref, widget.value);
    widget.value = storedValue;
    widget.callback?.(storedValue);
    if (widget.inputEl) {
        widget.inputEl.value = annotatedLabel;
    }

    if (Array.isArray(node.widgets_values)) {
        const idx = node.widgets?.indexOf?.(widget) ?? -1;
        if (idx >= 0) {
            node.widgets_values[idx] = annotatedLabel;
        }
    }

    // Update matching input widgets so the little combo shown on the socket reflects the change.
    if (Array.isArray(node.inputs)) {
        node.inputs.forEach(input => {
            if (!input?.widget) return;
            if (input.widget === widget || (widget.name && input.widget.name === widget.name)) {
                input.widget.value = annotatedLabel;
                if (input.widget.inputEl) {
                    input.widget.inputEl.value = annotatedLabel;
                }
            }
        });
    }

    // Add the new value to combo options if it's not there yet (keeps dropdowns consistent).
    if (typeof annotatedLabel === "string" && widget.options?.values) {
        const values = widget.options.values;
        if (Array.isArray(values) && !values.includes(annotatedLabel)) {
            values.push(annotatedLabel);
        }
    }
}

function createImageURLFromRef(ref) {
    if (!ref?.filename) return null;
    const params = new URLSearchParams();
    params.set("filename", ref.filename);
    params.set("type", ref.type || "input");
    params.set("subfolder", ref.subfolder || "");
    params.set("t", Date.now().toString());
    return api.apiURL(`/view?${params.toString()}`);
}

function setImageSource(target, newSrc) {
    if (!target || !newSrc) return;
    if (target instanceof Image) {
        target.src = newSrc;
    } else if (target.image instanceof Image) {
        target.image.src = newSrc;
    } else if (target.img instanceof Image) {
        target.img.src = newSrc;
    }
}

async function refreshComboLists() {
    if (typeof app.refreshComboInNodes === "function") {
        try {
            await app.refreshComboInNodes();
        } catch (err) {
            console.warn("SDVN.ImageEditor: refreshComboInNodes failed", err);
        }
    }
}

// --- ComfyUI Integration ---
app.registerExtension({
    name: "SDVN.ImageEditor",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        const getExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
        nodeType.prototype.getExtraMenuOptions = function(_, options) {
            // 1. Nodes with 'images' output (PreviewImage, SaveImage)
            if (this.imgs && this.imgs.length > 0) {
                options.push({
                    content: "🎨 Image Editor",
                    callback: () => {
                        const img = this.imgs[this.imgs.length - 1];
                        let src = null;
                        if (img && img.src) src = img.src;
                        else if (img && img.image) src = img.image.src;

                        if (src) {
                            new ImageEditor(src, async (blob) => {
                                const formData = new FormData();
                                const inferredName = extractFilenameFromSrc(src);
                                const editorName = buildEditorFilename(inferredName);
                                formData.append("image", blob, editorName);
                                formData.append("overwrite", "false");
                                formData.append("type", "input"); 
                                formData.append("subfolder", IMAGE_EDITOR_SUBFOLDER);
                                
                                try {
                                    const resp = await api.fetchApi("/upload/image", {
                                        method: "POST",
                                        body: formData,
                                    });
                                    const data = await resp.json();
                                    const ref = buildImageReference(data, { type: "input", subfolder: IMAGE_EDITOR_SUBFOLDER, filename: editorName });
                                    const imageWidget = this.widgets?.find?.(w => w.name === "image" || w.type === "image");
                                    if (imageWidget) {
                                        updateWidgetWithRef(this, imageWidget, ref);
                                    }
                                    const newSrc = createImageURLFromRef(ref);
                                    if (newSrc) {
                                        setImageSource(img, newSrc);
                                        app.graph.setDirtyCanvas(true);
                                    }
                                    await refreshComboLists();
                                    alert("Image saved to input folder: " + data.name);
                                } catch (e) {
                                    console.error("Upload failed", e);
                                    alert("Upload failed");
                                }
                            });
                        }
                    }
                });
            } 
            // 2. Nodes with 'image' widget (LoadImage)
            else if (this.widgets) {
                const imageWidget = this.widgets.find(w => w.name === "image" || w.type === "image");
                if (imageWidget && imageWidget.value) {
                     options.push({
                        content: "🎨 Image Editor",
                        callback: () => {
                            const parsed = parseImageWidgetValue(imageWidget.value);
                            if (!parsed.filename) {
                                alert("Image not available for editing.");
                                return;
                            }
                            const src = api.apiURL(`/view?filename=${encodeURIComponent(parsed.filename)}&type=${parsed.type}&subfolder=${encodeURIComponent(parsed.subfolder)}`);
                            
                            new ImageEditor(src, async (blob) => {
                                const formData = new FormData();
                                const newName = buildEditorFilename(parsed.filename);
                                formData.append("image", blob, newName);
                                formData.append("overwrite", "false");
                                formData.append("type", "input");
                                formData.append("subfolder", IMAGE_EDITOR_SUBFOLDER);
                                
                                try {
                                    const resp = await api.fetchApi("/upload/image", {
                                        method: "POST",
                                        body: formData,
                                    });
                                    const data = await resp.json();
                                    const ref = buildImageReference(data, { type: "input", subfolder: IMAGE_EDITOR_SUBFOLDER, filename: newName });
                                    
                                    if (imageWidget) {
                                        updateWidgetWithRef(this, imageWidget, ref);
                                    }
                                    
                                    // Force node update
                                    if (this.setSizeForImage) {
                                         // Some nodes have this method
                                         // We might need to fetch the image first or just trigger a reload
                                    }
                                    
                                    // Try to update preview image directly if possible
                                    // Add timestamp to force reload (cache busting)
                                    const newSrc = createImageURLFromRef(ref);
                                    
                                    if (this.imgs && this.imgs.length > 0) {
                                        // If the node already has an image element (some LoadImage nodes do)
                                        this.imgs.forEach((img) => setImageSource(img, newSrc));
                                    }
                                    
                                    this.setDirtyCanvas?.(true, true);
                                    app.graph.setDirtyCanvas(true, true);
                                    await refreshComboLists();
                                } catch (e) {
                                    console.error("Upload failed", e);
                                    alert("Upload failed");
                                }
                            });
                        }
                    });
                }
            }
            return getExtraMenuOptions?.apply(this, arguments);
        };
    }
});
