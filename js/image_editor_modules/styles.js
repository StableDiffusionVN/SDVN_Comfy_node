const STYLE_ID = "sdvn-image-editor-style";

const IMAGE_EDITOR_CSS = `
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

.apix-curve-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.apix-curve-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    color: var(--apix-text-dim);
    gap: 8px;
}
.apix-curve-channel-buttons {
    display: flex;
    gap: 6px;
}
.apix-curve-channel-btn {
    border: 1px solid var(--apix-border);
    background: transparent;
    color: var(--apix-text-dim);
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 999px;
    cursor: pointer;
    transition: all 0.2s;
}
.apix-curve-channel-btn.active {
    background: var(--apix-accent);
    color: #000;
    border-color: var(--apix-accent);
}
.apix-curve-reset {
    border: none;
    background: transparent;
    color: var(--apix-accent);
    font-size: 11px;
    cursor: pointer;
    padding: 0 4px;
}
.apix-curve-stage {
    width: 100%;
    height: 240px;
    border: 1px solid var(--apix-border);
    border-radius: 8px;
    background: linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0.25) 100%);
    position: relative;
    overflow: hidden;
}
.apix-curve-stage canvas {
    width: 100%;
    height: 100%;
    display: block;
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

export function injectImageEditorStyles() {
    if (document.getElementById(STYLE_ID)) {
        return;
    }
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = IMAGE_EDITOR_CSS;
    document.head.appendChild(style);
}
