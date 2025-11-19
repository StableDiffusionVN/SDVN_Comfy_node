import { ImageEditor } from "./editor.js";
import { IMAGE_EDITOR_SUBFOLDER } from "./constants.js";
import {
    parseImageWidgetValue,
    extractFilenameFromSrc,
    buildEditorFilename,
    buildImageReference,
    updateWidgetWithRef,
    createImageURLFromRef,
    setImageSource,
    refreshComboLists,
} from "./reference.js";

export function registerImageEditorExtension(app, api) {
    app.registerExtension({
        name: "SDVN.ImageEditor",
        async beforeRegisterNodeDef(nodeType) {
            const getExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
            nodeType.prototype.getExtraMenuOptions = function (_, options) {
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
                                        const ref = buildImageReference(data, {
                                            type: "input",
                                            subfolder: IMAGE_EDITOR_SUBFOLDER,
                                            filename: editorName,
                                        });
                                        const imageWidget = this.widgets?.find?.(
                                            (w) => w.name === "image" || w.type === "image"
                                        );
                                        if (imageWidget) {
                                            updateWidgetWithRef(this, imageWidget, ref);
                                        }
                                        const newSrc = createImageURLFromRef(api, ref);
                                        if (newSrc) {
                                            setImageSource(img, newSrc);
                                            app.graph.setDirtyCanvas(true);
                                        }
                                        await refreshComboLists(app);
                                        console.info("[SDVN.ImageEditor] Image saved to input folder:", data?.name || editorName);
                                    } catch (e) {
                                        console.error("[SDVN.ImageEditor] Upload failed", e);
                                    }
                                });
                            }
                        },
                    });
                } else if (this.widgets) {
                    const imageWidget = this.widgets.find((w) => w.name === "image" || w.type === "image");
                    if (imageWidget && imageWidget.value) {
                        options.push({
                            content: "🎨 Image Editor",
                            callback: () => {
                                const parsed = parseImageWidgetValue(imageWidget.value);
                                if (!parsed.filename) {
                                    console.warn("[SDVN.ImageEditor] Image not available for editing.");
                                    return;
                                }
                                const src = api.apiURL(
                                    `/view?filename=${encodeURIComponent(parsed.filename)}&type=${parsed.type}&subfolder=${encodeURIComponent(
                                        parsed.subfolder
                                    )}`
                                );

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
                                        const ref = buildImageReference(data, {
                                            type: "input",
                                            subfolder: IMAGE_EDITOR_SUBFOLDER,
                                            filename: newName,
                                        });

                                        if (imageWidget) {
                                            updateWidgetWithRef(this, imageWidget, ref);
                                        }

                                        const newSrc = createImageURLFromRef(api, ref);

                                        if (this.imgs && this.imgs.length > 0) {
                                            this.imgs.forEach((img) => setImageSource(img, newSrc));
                                        }

                                        this.setDirtyCanvas?.(true, true);
                                        app.graph.setDirtyCanvas(true, true);
                                        await refreshComboLists(app);
                                    } catch (e) {
                                        console.error("[SDVN.ImageEditor] Upload failed", e);
                                    }
                                });
                            },
                        });
                    }
                }
                return getExtraMenuOptions?.apply(this, arguments);
            };
        },
    });
}
