import { clamp01 } from "./color.js";

const CHANNEL_COLORS = {
    rgb: "#ffffff",
    r: "#ff7070",
    g: "#70ffa0",
    b: "#72a0ff"
};

export class CurveEditor {
    constructor({ canvas, channelButtons = [], resetButton, onChange, onCommit }) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.channelButtons = channelButtons;
        this.resetButton = resetButton;
        this.onChange = onChange;
        this.onCommit = onCommit;

        this.channels = ["rgb", "r", "g", "b"];
        this.activeChannel = "rgb";
        this.curves = this.createDefaultCurves();
        this.curveTangents = {};
        this.channels.forEach(channel => (this.curveTangents[channel] = []));
        this.luts = this.buildAllLUTs();
        this.isDragging = false;
        this.dragIndex = null;
        this.curveDirty = false;
        this.displayWidth = this.canvas.clientWidth || 240;
        this.displayHeight = this.canvas.clientHeight || 240;

        this.resizeObserver = null;
        this.handleResize = this.handleResize.bind(this);
        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
        this.onDoubleClick = this.onDoubleClick.bind(this);

        window.addEventListener("resize", this.handleResize);
        this.canvas.addEventListener("mousedown", this.onPointerDown);
        window.addEventListener("mousemove", this.onPointerMove);
        window.addEventListener("mouseup", this.onPointerUp);
        this.canvas.addEventListener("dblclick", this.onDoubleClick);

        this.attachChannelButtons();
        this.attachResetButton();
        this.handleResize();
        if (window.ResizeObserver) {
            this.resizeObserver = new ResizeObserver(() => this.handleResize());
            this.resizeObserver.observe(this.canvas);
        }
        this.draw();
    }

    destroy() {
        this.resizeObserver?.disconnect();
        window.removeEventListener("resize", this.handleResize);
        this.canvas.removeEventListener("mousedown", this.onPointerDown);
        window.removeEventListener("mousemove", this.onPointerMove);
        window.removeEventListener("mouseup", this.onPointerUp);
        this.canvas.removeEventListener("dblclick", this.onDoubleClick);
    }

    attachChannelButtons() {
        this.channelButtons.forEach(btn => {
            btn.addEventListener("click", () => {
                const channel = btn.dataset.curveChannel;
                if (channel && this.channels.includes(channel)) {
                    this.activeChannel = channel;
                    this.updateChannelButtons();
                    this.draw();
                }
            });
        });
        this.updateChannelButtons();
    }

    attachResetButton() {
        if (!this.resetButton) return;
        this.resetButton.addEventListener("click", () => {
            this.resetChannel(this.activeChannel);
            this.notifyChange();
            this.notifyCommit();
        });
    }

    updateChannelButtons() {
        this.channelButtons.forEach(btn => {
            const channel = btn.dataset.curveChannel;
            btn.classList.toggle("active", channel === this.activeChannel);
        });
    }

    handleResize() {
        const rect = this.canvas.getBoundingClientRect();
        const width = Math.max(1, rect.width || 240);
        const height = Math.max(1, rect.height || 240);
        this.displayWidth = width;
        this.displayHeight = height;
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);
        this.draw();
    }

    createDefaultCurve() {
        return [
            { x: 0, y: 0 },
            { x: 1, y: 1 }
        ];
    }

    createDefaultCurves() {
        return {
            rgb: this.createDefaultCurve().map(p => ({ ...p })),
            r: this.createDefaultCurve().map(p => ({ ...p })),
            g: this.createDefaultCurve().map(p => ({ ...p })),
            b: this.createDefaultCurve().map(p => ({ ...p }))
        };
    }

    cloneCurves(source = this.curves) {
        const clone = {};
        this.channels.forEach(channel => {
            clone[channel] = (source[channel] || this.createDefaultCurve()).map(p => ({ x: p.x, y: p.y }));
        });
        return clone;
    }

    setState(state) {
        if (!state) return;
        const incoming = this.cloneCurves(state.curves || {});
        this.curves = incoming;
        if (state.activeChannel && this.channels.includes(state.activeChannel)) {
            this.activeChannel = state.activeChannel;
        }
        this.rebuildAllLUTs();
        this.updateChannelButtons();
        this.draw();
    }

    getState() {
        return {
            curves: this.cloneCurves(),
            activeChannel: this.activeChannel
        };
    }

    resetChannel(channel, emit = false) {
        if (!this.channels.includes(channel)) return;
        this.curves[channel] = this.createDefaultCurve().map(p => ({ ...p }));
        this.rebuildChannelLUT(channel);
        this.draw();
        if (emit) {
            this.notifyChange();
            this.notifyCommit();
            this.curveDirty = false;
        }
    }

    resetAll(emit = true) {
        this.channels.forEach(channel => {
            this.curves[channel] = this.createDefaultCurve().map(p => ({ ...p }));
        });
        this.rebuildAllLUTs();
        this.draw();
        if (emit) {
            this.notifyChange();
            this.notifyCommit();
            this.curveDirty = false;
        }
    }

    hasAdjustments() {
        return this.channels.some(channel => !this.isDefaultCurve(this.curves[channel]));
    }

    isDefaultCurve(curve) {
        if (!curve || curve.length !== 2) return false;
        const [start, end] = curve;
        const epsilon = 0.0001;
        return Math.abs(start.x) < epsilon && Math.abs(start.y) < epsilon &&
            Math.abs(end.x - 1) < epsilon && Math.abs(end.y - 1) < epsilon;
    }

    notifyChange() {
        this.onChange?.();
    }

    notifyCommit() {
        this.onCommit?.();
    }

    getLUTPack() {
        return {
            rgb: this.isDefaultCurve(this.curves.rgb) ? null : this.luts.rgb,
            r: this.isDefaultCurve(this.curves.r) ? null : this.luts.r,
            g: this.isDefaultCurve(this.curves.g) ? null : this.luts.g,
            b: this.isDefaultCurve(this.curves.b) ? null : this.luts.b,
            hasAdjustments: this.hasAdjustments()
        };
    }

    buildAllLUTs() {
        const result = {};
        this.channels.forEach(channel => {
            const curve = this.curves[channel];
            const tangents = this.computeTangents(curve);
            this.curveTangents[channel] = tangents;
            result[channel] = this.buildCurveLUT(curve, tangents);
        });
        return result;
    }

    rebuildAllLUTs() {
        this.luts = this.buildAllLUTs();
    }

    rebuildChannelLUT(channel) {
        const curve = this.curves[channel];
        const tangents = this.computeTangents(curve);
        this.curveTangents[channel] = tangents;
        this.luts[channel] = this.buildCurveLUT(curve, tangents);
    }

    buildCurveLUT(curve, tangents = null) {
        const curveTangents = tangents || this.computeTangents(curve);
        const lut = new Uint8ClampedArray(256);
        for (let i = 0; i < 256; i++) {
            const pos = i / 255;
            lut[i] = Math.round(clamp01(this.sampleSmoothCurve(curve, pos, curveTangents)) * 255);
        }
        return lut;
    }

    computeTangents(curve) {
        const n = curve.length;
        if (n < 2) return new Array(n).fill(0);
        const tangents = new Array(n).fill(0);
        const delta = new Array(n - 1).fill(0);
        const dx = new Array(n - 1).fill(0);
        for (let i = 0; i < n - 1; i++) {
            dx[i] = Math.max(1e-6, curve[i + 1].x - curve[i].x);
            delta[i] = (curve[i + 1].y - curve[i].y) / dx[i];
        }
        tangents[0] = delta[0];
        tangents[n - 1] = delta[n - 2];
        for (let i = 1; i < n - 1; i++) {
            if (delta[i - 1] * delta[i] <= 0) {
                tangents[i] = 0;
            } else {
                const w1 = 2 * dx[i] + dx[i - 1];
                const w2 = dx[i] + 2 * dx[i - 1];
                tangents[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i]);
            }
        }
        for (let i = 0; i < n - 1; i++) {
            if (Math.abs(delta[i]) < 1e-6) {
                tangents[i] = 0;
                tangents[i + 1] = 0;
            } else {
                let alpha = tangents[i] / delta[i];
                let beta = tangents[i + 1] / delta[i];
                const sum = alpha * alpha + beta * beta;
                if (sum > 9) {
                    const tau = 3 / Math.sqrt(sum);
                    alpha *= tau;
                    beta *= tau;
                    tangents[i] = alpha * delta[i];
                    tangents[i + 1] = beta * delta[i];
                }
            }
        }
        return tangents;
    }

    sampleSmoothCurve(curve, t, tangents) {
        if (!curve || curve.length === 0) return t;
        const n = curve.length;
        if (!tangents || tangents.length !== n) {
            tangents = this.computeTangents(curve);
        }
        if (t <= curve[0].x) return curve[0].y;
        if (t >= curve[n - 1].x) return curve[n - 1].y;
        let idx = 1;
        for (; idx < n; idx++) {
            if (t <= curve[idx].x) break;
        }
        const p0 = curve[idx - 1];
        const p1 = curve[idx];
        const m0 = tangents[idx - 1] ?? 0;
        const m1 = tangents[idx] ?? 0;
        const span = p1.x - p0.x || 1e-6;
        const u = (t - p0.x) / span;
        const h00 = (2 * u ** 3) - (3 * u ** 2) + 1;
        const h10 = u ** 3 - 2 * u ** 2 + u;
        const h01 = (-2 * u ** 3) + (3 * u ** 2);
        const h11 = u ** 3 - u ** 2;
        const value = h00 * p0.y + h10 * span * m0 + h01 * p1.y + h11 * span * m1;
        return clamp01(value);
    }

    getActiveCurve() {
        return this.curves[this.activeChannel];
    }

    addPoint(x, y) {
        const points = this.getActiveCurve();
        let insertIndex = points.findIndex(point => x < point.x);
        if (insertIndex === -1) {
            points.push({ x, y });
            insertIndex = points.length - 1;
        } else {
            points.splice(insertIndex, 0, { x, y });
        }
        this.rebuildChannelLUT(this.activeChannel);
        this.draw();
        this.curveDirty = true;
        this.notifyChange();
        return insertIndex;
    }

    updatePoint(index, x, y) {
        const points = this.getActiveCurve();
        const point = points[index];
        if (!point) return;
        const originalX = point.x;
        const originalY = point.y;
        if (index === 0) {
            point.x = 0;
            point.y = clamp01(y);
        } else if (index === points.length - 1) {
            point.x = 1;
            point.y = clamp01(y);
        } else {
            const minX = points[index - 1].x + 0.01;
            const maxX = points[index + 1].x - 0.01;
            point.x = clamp01(Math.min(Math.max(x, minX), maxX));
            point.y = clamp01(y);
        }
        if (Math.abs(originalX - point.x) < 0.0001 && Math.abs(originalY - point.y) < 0.0001) {
            return;
        }
        this.rebuildChannelLUT(this.activeChannel);
        this.draw();
        this.curveDirty = true;
        this.notifyChange();
    }

    removePoint(index) {
        const points = this.getActiveCurve();
        if (index <= 0 || index >= points.length - 1) return;
        points.splice(index, 1);
        this.rebuildChannelLUT(this.activeChannel);
        this.draw();
        this.notifyChange();
        this.notifyCommit();
        this.curveDirty = false;
    }

    getPointerPosition(event) {
        const rect = this.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;
        const x = clamp01((event.clientX - rect.left) / rect.width);
        const y = clamp01(1 - (event.clientY - rect.top) / rect.height);
        return { x, y };
    }

    findPointIndex(pos, threshold = 10) {
        if (!pos) return -1;
        const points = this.getActiveCurve();
        const targetX = pos.x * this.displayWidth;
        const targetY = (1 - pos.y) * this.displayHeight;
        for (let i = 0; i < points.length; i++) {
            const pt = points[i];
            const px = pt.x * this.displayWidth;
            const py = (1 - pt.y) * this.displayHeight;
            const dist = Math.hypot(px - targetX, py - targetY);
            if (dist <= threshold) return i;
        }
        return -1;
    }

    onPointerDown(event) {
        if (event.button !== 0) return;
        const pos = this.getPointerPosition(event);
        if (!pos) return;
        event.preventDefault();
        let idx = this.findPointIndex(pos);
        if (idx === -1) {
            idx = this.addPoint(pos.x, pos.y);
        }
        this.dragIndex = idx;
        this.isDragging = true;
        this.updatePoint(idx, pos.x, pos.y);
    }

    onPointerMove(event) {
        if (!this.isDragging || this.dragIndex === null) return;
        const pos = this.getPointerPosition(event);
        if (!pos) return;
        event.preventDefault();
        this.updatePoint(this.dragIndex, pos.x, pos.y);
    }

    onPointerUp() {
        if (!this.isDragging) return;
        this.isDragging = false;
        this.dragIndex = null;
        if (this.curveDirty) {
            this.curveDirty = false;
            this.notifyCommit();
        }
    }

    onDoubleClick(event) {
        const pos = this.getPointerPosition(event);
        if (!pos) return;
        const idx = this.findPointIndex(pos, 8);
        if (idx > 0 && idx < this.getActiveCurve().length - 1) {
            this.removePoint(idx);
        }
    }

    getChannelColor() {
        return CHANNEL_COLORS[this.activeChannel] || "#ffffff";
    }

    draw() {
        if (!this.ctx) return;
        const ctx = this.ctx;
        const w = this.displayWidth;
        const h = this.displayHeight;
        ctx.clearRect(0, 0, w, h);
        this.drawGrid(ctx, w, h);
        this.drawCurve(ctx, w, h);
        this.drawPoints(ctx, w, h);
    }

    drawGrid(ctx, w, h) {
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 1;
        for (let i = 1; i < 4; i++) {
            const x = (w / 4) * i;
            const y = (h / 4) * i;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }
    }

    drawCurve(ctx, w, h) {
        const points = this.getActiveCurve();
        if (!points?.length) return;
        const tangents = this.curveTangents[this.activeChannel] || this.computeTangents(points);
        ctx.strokeStyle = this.getChannelColor();
        ctx.lineWidth = 2;
        ctx.beginPath();
        const steps = 128;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const value = this.sampleSmoothCurve(points, t, tangents);
            const x = t * w;
            const y = (1 - value) * h;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    drawPoints(ctx, w, h) {
        const points = this.getActiveCurve();
        ctx.fillStyle = "#000";
        ctx.lineWidth = 2;
        ctx.strokeStyle = this.getChannelColor();
        points.forEach(pt => {
            const x = pt.x * w;
            const y = (1 - pt.y) * h;
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        });
    }
}
