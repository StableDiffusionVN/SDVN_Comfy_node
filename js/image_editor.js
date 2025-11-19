import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import { injectImageEditorStyles } from "./image_editor_modules/styles.js";
import { registerImageEditorExtension } from "./image_editor_modules/extension.js";

injectImageEditorStyles();
registerImageEditorExtension(app, api);
