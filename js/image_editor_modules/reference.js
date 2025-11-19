export function buildImageReference(data, fallback = {}) {
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

export function buildAnnotatedLabel(ref) {
    if (!ref?.filename) return "";
    const path = ref.subfolder ? `${ref.subfolder}/${ref.filename}` : ref.filename;
    return `${path} [${ref.type || "input"}]`;
}

export function parseImageWidgetValue(value) {
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

export function sanitizeFilenamePart(part) {
    return (part || "")
        .replace(/[\\/]/g, "_")
        .replace(/[<>:"|?*\x00-\x1F]/g, "_")
        .replace(/\s+/g, "_");
}

export function buildEditorFilename(sourceName) {
    let name = sourceName ? sourceName.toString() : "";
    name = name.split(/[\\/]/).pop() || "";
    name = name.replace(/\.[^.]+$/, "");
    name = sanitizeFilenamePart(name);
    if (!name) name = `image_${Date.now()}`;
    return `${name}.png`;
}

export function extractFilenameFromSrc(src) {
    if (!src) return null;
    try {
        const url = new URL(src, window.location.origin);
        return url.searchParams.get("filename");
    } catch {
        return null;
    }
}

export function formatWidgetValueFromRef(ref, currentValue) {
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

export function updateWidgetWithRef(node, widget, ref) {
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

    if (typeof annotatedLabel === "string" && widget.options?.values) {
        const values = widget.options.values;
        if (Array.isArray(values) && !values.includes(annotatedLabel)) {
            values.push(annotatedLabel);
        }
    }
}

export function createImageURLFromRef(api, ref) {
    if (!ref?.filename) return null;
    const params = new URLSearchParams();
    params.set("filename", ref.filename);
    params.set("type", ref.type || "input");
    params.set("subfolder", ref.subfolder || "");
    params.set("t", Date.now().toString());
    return api.apiURL(`/view?${params.toString()}`);
}

export function setImageSource(target, newSrc) {
    if (!target || !newSrc) return;
    if (target instanceof Image) {
        target.src = newSrc;
    } else if (target.image instanceof Image) {
        target.image.src = newSrc;
    } else if (target.img instanceof Image) {
        target.img.src = newSrc;
    }
}

export async function refreshComboLists(app) {
    if (typeof app.refreshComboInNodes === "function") {
        try {
            await app.refreshComboInNodes();
        } catch (err) {
            console.warn("SDVN.ImageEditor: refreshComboInNodes failed", err);
        }
    }
}
