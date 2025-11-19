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
    height: 100vh;
    max-height: 100vh;
    overflow: hidden;
}
.apix-sidebar-scroll {
    flex: 1;
    overflow-y: auto;
    padding-bottom: 20px;
    scrollbar-width: thin;
    scrollbar-color: var(--apix-accent) transparent;
}
.apix-sidebar-scroll::-webkit-scrollbar {
    width: 6px;
}
.apix-sidebar-scroll::-webkit-scrollbar-thumb {
    background: var(--apix-accent);
    border-radius: 3px;
}
.apix-sidebar-scroll::-webkit-scrollbar-track {
    background: transparent;
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
.apix-tool-btn.icon-only svg {
    width: 18px;
    height: 18px;
}
.apix-sidebar-divider {
    width: 24px;
    height: 1px;
    background: var(--apix-border);
    margin: 12px 0;
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
.apix-panel-header span:first-child {
    color: #8d8d8d;
    font-weight: 700;
    letter-spacing: 0.3px;
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
    font-size: 12px;
    color: var(--apix-text-dim);
    letter-spacing: 0.2px;
    font-weight: 600;
}
.apix-slider-meta {
    display: flex;
    align-items: center;
    justify-content: flex-end;
}
.apix-slider-meta span {
    min-width: 36px;
    text-align: right;
    font-variant-numeric: tabular-nums;
}
.apix-slider-wrapper {
    position: relative;
    width: 100%;
    padding-right: 26px;
}
.apix-slider-reset {
    border: none;
    background: transparent;
    color: var(--apix-text-dim);
    cursor: pointer;
    width: 22px;
    height: 22px;
    position: absolute;
    right: 0;
    top: 56%;
    transform: translateY(-50%);
    opacity: 0.4;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: opacity 0.2s, color 0.2s;
}
.apix-slider-reset:hover {
    opacity: 1;
    color: var(--apix-accent);
}
.apix-slider-reset svg {
    width: 12px;
    height: 12px;
    pointer-events: none;
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
.apix-btn-toggle.active {
    background: var(--apix-accent);
    color: #000;
}
.apix-hsl-swatches {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}
.apix-hsl-chip {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 2px solid transparent;
    background: var(--chip-color, #fff);
    cursor: pointer;
    transition: transform 0.2s, border 0.2s;
}
.apix-hsl-chip.active {
    border-color: var(--apix-accent);
    transform: scale(1.05);
}
.apix-hsl-slider .apix-slider-meta span {
    font-size: 11px;
    color: var(--apix-text-dim);
}
.apix-hsl-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    align-items: center;
    font-size: 11px;
    color: var(--apix-text-dim);
}
.apix-hsl-reset {
    border: none;
    background: transparent;
    color: var(--apix-accent);
    cursor: pointer;
    font-size: 11px;
}
    
    .apix-sidebar-right {
        position: relative;
    }
    .apix-footer {
        padding: 20px;
        border-top: 1px solid var(--apix-border);
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        background: var(--apix-panel);
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
    reset: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>`,
    chevronDown: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>`,
    close: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
    flipH: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 7 3 3 7 3"></polyline><line x1="3" y1="3" x2="10" y2="10"></line><polyline points="21 17 21 21 17 21"></polyline><line x1="21" y1="21" x2="14" y2="14"></line></svg>`,
    flipV: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="7 21 3 21 3 17"></polyline><line x1="3" y1="21" x2="10" y2="14"></line><polyline points="17 3 21 3 21 7"></polyline><line x1="21" y1="3" x2="14" y2="10"></line></svg>`
};

const HSL_COLORS = [
    { id: "red", label: "Red", color: "#ff4b4b", center: 0 / 360, width: 0.08 },
    { id: "orange", label: "Orange", color: "#ff884d", center: 30 / 360, width: 0.08 },
    { id: "yellow", label: "Yellow", color: "#ffd84d", center: 50 / 360, width: 0.08 },
    { id: "green", label: "Green", color: "#45d98e", center: 120 / 360, width: 0.08 },
    { id: "cyan", label: "Cyan", color: "#30c4ff", center: 180 / 360, width: 0.08 },
    { id: "blue", label: "Blue", color: "#2f7bff", center: 220 / 360, width: 0.08 },
    { id: "magenta", label: "Magenta", color: "#c95bff", center: 300 / 360, width: 0.08 }
];

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

        // Main Actions
        this.overlay.querySelector("#action-close").onclick = () => this.close();
        this.overlay.querySelector("#action-save").onclick = () => this.save();
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
        return totalNoise > 0 || this.hasHSLAdjustments() || p.clarity !== 0 || p.dehaze !== 0 || p.highlight !== 0 || p.shadow !== 0;
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

    applyPixelEffectsRegion(ctx, x, y, width, height) {
        const p = this.params;
        const totalNoise = Math.max(0, (p.noise || 0) + (p.grain || 0));
        const needsProcessing = totalNoise > 0 || this.hasHSLAdjustments() || p.clarity !== 0 || p.dehaze !== 0 || p.highlight !== 0 || p.shadow !== 0;
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
            const influence = Math.max(0, 1 - dist / (color.width || 0.08));
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

function clamp01(value) {
    return Math.min(1, Math.max(0, value));
}

function clamp255(value) {
    return Math.min(255, Math.max(0, value));
}

function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h;
    let s;
    const l = (max + min) / 2;
    if (max === min) {
        h = 0;
        s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r:
                h = (g - b) / d + (g < b ? 6 : 0);
                break;
            case g:
                h = (b - r) / d + 2;
                break;
            default:
                h = (r - g) / d + 4;
        }
        h /= 6;
    }
    return { h, s, l };
}

function hslToRgb(h, s, l) {
    let r;
    let g;
    let b;

    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }

    return { r: r * 255, g: g * 255, b: b * 255 };
}

function hueDistance(a, b) {
    let diff = Math.abs(a - b);
    diff = Math.min(diff, 1 - diff);
    return diff;
}

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
