"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const url = require("url");
const markdown_preview_view_1 = require("./markdown-preview-view");
const renderer = require("./renderer");
const mathjaxHelper = require("./mathjax-helper");
const atom_1 = require("atom");
const util_1 = require("./util");
const placeholder_view_1 = require("./placeholder-view");
var config_1 = require("./config");
exports.config = config_1.config;
let disposables;
async function activate() {
    if (atom.packages.isPackageActive('markdown-preview')) {
        await atom.packages.deactivatePackage('markdown-preview');
        atom.notifications.addInfo('Markdown-preview-plus has deactivated markdown-preview package.' +
            'You may want to disable it manually to avoid this message.');
    }
    disposables = new atom_1.CompositeDisposable();
    disposables.add(atom.commands.add('atom-workspace', {
        'markdown-preview-plus:toggle-break-on-single-newline': function () {
            const keyPath = 'markdown-preview-plus.breakOnSingleNewline';
            atom.config.set(keyPath, !atom.config.get(keyPath));
        },
    }), atom.commands.add('.markdown-preview-plus', {
        'markdown-preview-plus:toggle': close,
    }), atom.commands.add('atom-text-editor', {
        'markdown-preview-plus:toggle-render-latex': (e) => {
            const editor = e.currentTarget.getModel();
            const view = markdown_preview_view_1.MarkdownPreviewViewEditor.viewForEditor(editor);
            if (view)
                view.toggleRenderLatex();
        },
    }), atom.commands.add('.markdown-preview-plus', {
        'markdown-preview-plus:toggle-render-latex': (e) => {
            const view = e.currentTarget.getModel();
            view.toggleRenderLatex();
        },
    }), atom.workspace.addOpener(opener), atom.config.observe('markdown-preview-plus.grammars', configObserver(registerGrammars)), atom.config.observe('markdown-preview-plus.extensions', configObserver(registerExtensions)));
}
exports.activate = activate;
function deactivate() {
    disposables && disposables.dispose();
}
exports.deactivate = deactivate;
function createMarkdownPreviewView(state) {
    if (state.editorId !== undefined) {
        return new placeholder_view_1.PlaceholderView(state.editorId);
    }
    else if (state.filePath && util_1.isFileSync(state.filePath)) {
        return new markdown_preview_view_1.MarkdownPreviewViewFile(state.filePath);
    }
    return undefined;
}
exports.createMarkdownPreviewView = createMarkdownPreviewView;
function copyHtml(_callback, _scale) {
    const editor = atom.workspace.getActiveTextEditor();
    if (!editor)
        return;
    util_1.handlePromise(copyHtmlInternal(editor));
}
exports.copyHtml = copyHtml;
function close(event) {
    const item = event.currentTarget.getModel();
    const pane = atom.workspace.paneForItem(item);
    if (!pane)
        return undefined;
    return pane.destroyItem(item);
}
async function toggle(editor) {
    if (removePreviewForEditor(editor))
        return undefined;
    else
        return addPreviewForEditor(editor);
}
function removePreviewForEditor(editor) {
    const item = markdown_preview_view_1.MarkdownPreviewViewEditor.viewForEditor(editor);
    if (!item)
        return false;
    const previewPane = atom.workspace.paneForItem(item);
    if (!previewPane)
        return false;
    if (item !== previewPane.getActiveItem()) {
        previewPane.activateItem(item);
        return false;
    }
    util_1.handlePromise(previewPane.destroyItem(item));
    return true;
}
async function addPreviewForEditor(editor) {
    const previousActivePane = atom.workspace.getActivePane();
    const options = { searchAllPanes: true };
    if (atom.config.get('markdown-preview-plus.openPreviewInSplitPane')) {
        options.split = atom.config.get('markdown-preview-plus.previewSplitPaneDir');
    }
    const res = await atom.workspace.open(markdown_preview_view_1.MarkdownPreviewViewEditor.create(editor), options);
    previousActivePane.activate();
    return res;
}
async function previewFile({ currentTarget }) {
    const filePath = currentTarget.dataset.path;
    if (!filePath) {
        return undefined;
    }
    for (const editor of atom.workspace.getTextEditors()) {
        if (editor.getPath() === filePath) {
            return addPreviewForEditor(editor);
        }
    }
    return atom.workspace.open(`markdown-preview-plus://file/${encodeURI(filePath)}`, {
        searchAllPanes: true,
    });
}
async function copyHtmlInternal(editor) {
    const text = editor.getSelectedText() || editor.getText();
    const renderLaTeX = atom.config.get('markdown-preview-plus.enableLatexRenderingByDefault');
    const html = await renderer.toHTML(text, editor.getPath(), editor.getGrammar(), !!renderLaTeX, true);
    if (renderLaTeX) {
        const frame = document.createElement('iframe');
        frame.src = 'about:blank';
        frame.style.display = 'none';
        frame.addEventListener('load', async () => {
            const proHTML = await mathjaxHelper.processHTMLString(frame, html.body);
            frame.remove();
            atom.clipboard.write(proHTML);
        });
        document.body.appendChild(frame);
    }
    else {
        atom.clipboard.write(html.body.innerHTML);
    }
}
function configObserver(f) {
    let configDisposables;
    return function (value) {
        if (!disposables)
            return;
        if (configDisposables) {
            configDisposables.dispose();
            disposables.remove(configDisposables);
        }
        configDisposables = new atom_1.CompositeDisposable();
        const contextMenu = {};
        f(value, configDisposables, contextMenu);
        configDisposables.add(atom.contextMenu.add(contextMenu));
        disposables.add(configDisposables);
    };
}
function registerExtensions(extensions, disp, cm) {
    for (const ext of extensions) {
        const selector = `.tree-view .file .name[data-name$=".${ext}"]`;
        disp.add(atom.commands.add(selector, 'markdown-preview-plus:preview-file', previewFile));
        cm[selector] = [
            {
                label: 'Markdown Preview',
                command: 'markdown-preview-plus:preview-file',
            },
        ];
    }
}
function registerGrammars(grammars, disp, cm) {
    for (const gr of grammars) {
        const grs = gr.replace(/\./g, ' ');
        const selector = `atom-text-editor[data-grammar="${grs}"]`;
        disp.add(atom.commands.add(selector, {
            'markdown-preview-plus:toggle': (e) => {
                util_1.handlePromise(toggle(e.currentTarget.getModel()));
            },
            'markdown-preview-plus:copy-html': (e) => {
                util_1.handlePromise(copyHtmlInternal(e.currentTarget.getModel()));
            },
        }));
        cm[selector] = [
            {
                label: 'Sync Preview',
                command: 'markdown-preview-plus:sync-preview',
            },
        ];
    }
}
function opener(uriToOpen) {
    try {
        var uri = url.parse(uriToOpen);
    }
    catch (e) {
        console.error(e, uriToOpen);
        return undefined;
    }
    if (uri.protocol !== 'markdown-preview-plus:')
        return undefined;
    if (!uri.pathname)
        return undefined;
    try {
        var pathname = decodeURI(uri.pathname);
    }
    catch (e) {
        console.error(e);
        return undefined;
    }
    if (uri.hostname === 'file') {
        return new markdown_preview_view_1.MarkdownPreviewViewFile(pathname.slice(1));
    }
    else {
        throw new Error(`Tried to open markdown-preview-plus with uri ${uriToOpen}. This is not supported. Please report this error.`);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsMkJBQTJCO0FBQzNCLG1FQUtnQztBQUNoQyx1Q0FBdUM7QUFDdkMsa0RBQWtEO0FBQ2xELCtCQU1hO0FBQ2IsaUNBQWtEO0FBQ2xELHlEQUFvRDtBQUVwRCxtQ0FBaUM7QUFBeEIsMEJBQUEsTUFBTSxDQUFBO0FBRWYsSUFBSSxXQUE0QyxDQUFBO0FBRXpDLEtBQUs7SUFDVixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN0RCxNQUFNLElBQUksQ0FBQyxRQUFRLENBQUMsaUJBQWlCLENBQUMsa0JBQWtCLENBQUMsQ0FBQTtRQUN6RCxJQUFJLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FDeEIsaUVBQWlFO1lBQy9ELDREQUE0RCxDQUMvRCxDQUFBO0lBQ0gsQ0FBQztJQUNELFdBQVcsR0FBRyxJQUFJLDBCQUFtQixFQUFFLENBQUE7SUFDdkMsV0FBVyxDQUFDLEdBQUcsQ0FDYixJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsRUFBRTtRQUNsQyxzREFBc0QsRUFBRTtZQUN0RCxNQUFNLE9BQU8sR0FBRyw0Q0FBNEMsQ0FBQTtZQUM1RCxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFBO1FBQ3JELENBQUM7S0FDRixDQUFDLEVBQ0YsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsd0JBQXdCLEVBQUU7UUFDMUMsOEJBQThCLEVBQUUsS0FBSztLQUN0QyxDQUFDLEVBQ0YsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLEVBQUU7UUFDcEMsMkNBQTJDLEVBQUUsQ0FBQyxD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QUN2RCxDQUFDO0lBQUMsSUFBSSxDQUFDLENBQUM7UUFDTixNQUFNLElBQUksS0FBSyxDQUNiLGdEQUFnRCxTQUFTLG9EQUFvRCxDQUM5RyxDQUFBO0lBQ0gsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgdXJsID0gcmVxdWlyZSgndXJsJylcbmltcG9ydCB7XG4gIE1hcmtkb3duUHJldmlld1ZpZXdFbGVtZW50LFxuICBTZXJpYWxpemVkTVBWLFxuICBNYXJrZG93blByZXZpZXdWaWV3RmlsZSxcbiAgTWFya2Rvd25QcmV2aWV3Vmlld0VkaXRvcixcbn0gZnJvbSAnLi9tYXJrZG93bi1wcmV2aWV3LXZpZXcnXG5pbXBvcnQgcmVuZGVyZXIgPSByZXF1aXJlKCcuL3JlbmRlcmVyJylcbmltcG9ydCBtYXRoamF4SGVscGVyID0gcmVxdWlyZSgnLi9tYXRoamF4LWhlbHBlcicpXG5pbXBvcnQge1xuICBUZXh0RWRpdG9yLFxuICBXb3Jrc3BhY2VPcGVuT3B0aW9ucyxcbiAgQ29tbWFuZEV2ZW50LFxuICBDb21wb3NpdGVEaXNwb3NhYmxlLFxuICBDb250ZXh0TWVudU9wdGlvbnMsXG59IGZyb20gJ2F0b20nXG5pbXBvcnQgeyBoYW5kbGVQcm9taXNlLCBpc0ZpbGVTeW5jIH0gZnJvbSAnLi91dGlsJ1xuaW1wb3J0IHsgUGxhY2Vob2xkZXJWaWV3IH0gZnJvbSAnLi9wbGFjZWhvbGRlci12aWV3J1xuXG5leHBvcnQgeyBjb25maWcgfSBmcm9tICcuL2NvbmZpZydcblxubGV0IGRpc3Bvc2FibGVzOiBDb21wb3NpdGVEaXNwb3NhYmxlIHwgdW5kZWZpbmVkXG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBhY3RpdmF0ZSgpIHtcbiAgaWYgKGF0b20ucGFja2FnZXMuaXNQYWNrYWdlQWN0aXZlKCdtYXJrZG93bi1wcmV2aWV3JykpIHtcbiAgICBhd2FpdCBhdG9tLnBhY2thZ2VzLmRlYWN0aXZhdGVQYWNrYWdlKCdtYXJrZG93bi1wcmV2aWV3JylcbiAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkSW5mbyhcbiAgICAgICdNYXJrZG93bi1wcmV2aWV3LXBsdXMgaGFzIGRlYWN0aXZhdGVkIG1hcmtkb3duLXByZXZpZXcgcGFja2FnZS4nICtcbiAgICAgICAgJ1lvdSBtYXkgd2FudCB0byBkaXNhYmxlIGl0IG1hbnVhbGx5IHRvIGF2b2lkIHRoaXMgbWVzc2FnZS4nLFxuICAgIClcbiAgfVxuICBkaXNwb3NhYmxlcyA9IG5ldyBDb21wb3NpdGVEaXNwb3NhYmxlKClcbiAgZGlzcG9zYWJsZXMuYWRkKFxuICAgIGF0b20uY29tbWFuZHMuYWRkKCdhdG9tLXdvcmtzcGFjZScsIHtcbiAgICAgICdtYXJrZG93bi1wcmV2aWV3LXBsdXM6dG9nZ2xlLWJyZWFrLW9uLXNpbmdsZS1uZXdsaW5lJzogZnVuY3Rpb24oKSB7XG4gICAgICAgIGNvbnN0IGtleVBhdGggPSAnbWFya2Rvd24tcHJldmlldy1wbHVzLmJyZWFrT25TaW5nbGVOZXdsaW5lJ1xuICAgICAgICBhdG9tLmNvbmZpZy5zZXQoa2V5UGF0aCwgIWF0b20uY29uZmlnLmdldChrZXlQYXRoKSlcbiAgICAgIH0sXG4gICAgfSksXG4gICAgYXRvbS5jb21tYW5kcy5hZGQoJy5tYXJrZG93bi1wcmV2aWV3LXBsdXMnLCB7XG4gICAgICAnbWFya2Rvd24tcHJldmlldy1wbHVzOnRvZ2dsZSc6IGNsb3NlLFxuICAgIH0pLFxuICAgIGF0b20uY29tbWFuZHMuYWRkKCdhdG9tLXRleHQtZWRpdG9yJywge1xuICAgICAgJ21hcmtkb3duLXByZXZpZXctcGx1czp0b2dnbGUtcmVuZGVyLWxhdGV4JzogKGUpID0+IHtcbiAgICAgICAgY29uc3QgZWRpdG9yID0gZS5jdXJyZW50VGFyZ2V0LmdldE1vZGVsKClcbiAgICAgICAgY29uc3QgdmlldyA9IE1hcmtkb3duUHJldmlld1ZpZXdFZGl0b3Iudmlld0ZvckVkaXRvcihlZGl0b3IpXG4gICAgICAgIGlmICh2aWV3KSB2aWV3LnRvZ2dsZVJlbmRlckxhdGV4KClcbiAgICAgIH0sXG4gICAgfSksXG4gICAgYXRvbS5jb21tYW5kcy5hZGQoJy5tYXJrZG93bi1wcmV2aWV3LXBsdXMnLCB7XG4gICAgICAnbWFya2Rvd24tcHJldmlldy1wbHVzOnRvZ2dsZS1yZW5kZXItbGF0ZXgnOiAoZSkgPT4ge1xuICAgICAgICBjb25zdCB2aWV3ID0gZS5jdXJyZW50VGFyZ2V0LmdldE1vZGVsKClcbiAgICAgICAgdmlldy50b2dnbGVSZW5kZXJMYXRleCgpXG4gICAgICB9LFxuICAgIH0pLFxuICAgIGF0b20ud29ya3NwYWNlLmFkZE9wZW5lcihvcGVuZXIpLFxuICAgIGF0b20uY29uZmlnLm9ic2VydmUoXG4gICAgICAnbWFya2Rvd24tcHJldmlldy1wbHVzLmdyYW1tYXJzJyxcbiAgICAgIGNvbmZpZ09ic2VydmVyKHJlZ2lzdGVyR3JhbW1hcnMpLFxuICAgICksXG4gICAgYXRvbS5jb25maWcub2JzZXJ2ZShcbiAgICAgICdtYXJrZG93bi1wcmV2aWV3LXBsdXMuZXh0ZW5zaW9ucycsXG4gICAgICBjb25maWdPYnNlcnZlcihyZWdpc3RlckV4dGVuc2lvbnMpLFxuICAgICksXG4gIClcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRlYWN0aXZhdGUoKSB7XG4gIGRpc3Bvc2FibGVzICYmIGRpc3Bvc2FibGVzLmRpc3Bvc2UoKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTWFya2Rvd25QcmV2aWV3VmlldyhzdGF0ZTogU2VyaWFsaXplZE1QVikge1xuICBpZiAoc3RhdGUuZWRpdG9ySWQgIT09IHVuZGVmaW5lZCkge1xuICAgIHJldHVybiBuZXcgUGxhY2Vob2xkZXJWaWV3KHN0YXRlLmVkaXRvcklkKVxuICB9IGVsc2UgaWYgKHN0YXRlLmZpbGVQYXRoICYmIGlzRmlsZVN5bmMoc3RhdGUuZmlsZVBhdGgpKSB7XG4gICAgcmV0dXJuIG5ldyBNYXJrZG93blByZXZpZXdWaWV3RmlsZShzdGF0ZS5maWxlUGF0aClcbiAgfVxuICByZXR1cm4gdW5kZWZpbmVkXG59XG5cbi8vLyB1c2VkIGJ5IG1hcmtkb3duLXBkZlxuZXhwb3J0IGZ1bmN0aW9uIGNvcHlIdG1sKF9jYWxsYmFjazogYW55LCBfc2NhbGU6IG51bWJlcikge1xuICBjb25zdCBlZGl0b3IgPSBhdG9tLndvcmtzcGFjZS5nZXRBY3RpdmVUZXh0RWRpdG9yKClcbiAgaWYgKCFlZGl0b3IpIHJldHVyblxuICBoYW5kbGVQcm9taXNlKGNvcHlIdG1sSW50ZXJuYWwoZWRpdG9yKSlcbn1cblxuLy8vIHByaXZhdGVcblxuZnVuY3Rpb24gY2xvc2UoZXZlbnQ6IENvbW1hbmRFdmVudDxNYXJrZG93blByZXZpZXdWaWV3RWxlbWVudD4pIHtcbiAgY29uc3QgaXRlbSA9IGV2ZW50LmN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKVxuICBjb25zdCBwYW5lID0gYXRvbS53b3Jrc3BhY2UucGFuZUZvckl0ZW0oaXRlbSlcbiAgaWYgKCFwYW5lKSByZXR1cm4gdW5kZWZpbmVkXG4gIHJldHVybiBwYW5lLmRlc3Ryb3lJdGVtKGl0ZW0pXG59XG5cbmFzeW5jIGZ1bmN0aW9uIHRvZ2dsZShlZGl0b3I6IFRleHRFZGl0b3IpIHtcbiAgaWYgKHJlbW92ZVByZXZpZXdGb3JFZGl0b3IoZWRpdG9yKSkgcmV0dXJuIHVuZGVmaW5lZFxuICBlbHNlIHJldHVybiBhZGRQcmV2aWV3Rm9yRWRpdG9yKGVkaXRvcilcbn1cblxuZnVuY3Rpb24gcmVtb3ZlUHJldmlld0ZvckVkaXRvcihlZGl0b3I6IFRleHRFZGl0b3IpIHtcbiAgY29uc3QgaXRlbSA9IE1hcmtkb3duUHJldmlld1ZpZXdFZGl0b3Iudmlld0ZvckVkaXRvcihlZGl0b3IpXG4gIGlmICghaXRlbSkgcmV0dXJuIGZhbHNlXG4gIGNvbnN0IHByZXZpZXdQYW5lID0gYXRvbS53b3Jrc3BhY2UucGFuZUZvckl0ZW0oaXRlbSlcbiAgaWYgKCFwcmV2aWV3UGFuZSkgcmV0dXJuIGZhbHNlXG4gIGlmIChpdGVtICE9PSBwcmV2aWV3UGFuZS5nZXRBY3RpdmVJdGVtKCkpIHtcbiAgICBwcmV2aWV3UGFuZS5hY3RpdmF0ZUl0ZW0oaXRlbSlcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxuICBoYW5kbGVQcm9taXNlKHByZXZpZXdQYW5lLmRlc3Ryb3lJdGVtKGl0ZW0pKVxuICByZXR1cm4gdHJ1ZVxufVxuXG5hc3luYyBmdW5jdGlvbiBhZGRQcmV2aWV3Rm9yRWRpdG9yKGVkaXRvcjogVGV4dEVkaXRvcikge1xuICBjb25zdCBwcmV2aW91c0FjdGl2ZVBhbmUgPSBhdG9tLndvcmtzcGFjZS5nZXRBY3RpdmVQYW5lKClcbiAgY29uc3Qgb3B0aW9uczogV29ya3NwYWNlT3Blbk9wdGlvbnMgPSB7IHNlYXJjaEFsbFBhbmVzOiB0cnVlIH1cbiAgaWYgKGF0b20uY29uZmlnLmdldCgnbWFya2Rvd24tcHJldmlldy1wbHVzLm9wZW5QcmV2aWV3SW5TcGxpdFBhbmUnKSkge1xuICAgIG9wdGlvbnMuc3BsaXQgPSBhdG9tLmNvbmZpZy5nZXQoXG4gICAgICAnbWFya2Rvd24tcHJldmlldy1wbHVzLnByZXZpZXdTcGxpdFBhbmVEaXInLFxuICAgICkhXG4gIH1cbiAgY29uc3QgcmVzID0gYXdhaXQgYXRvbS53b3Jrc3BhY2Uub3BlbihcbiAgICBNYXJrZG93blByZXZpZXdWaWV3RWRpdG9yLmNyZWF0ZShlZGl0b3IpLFxuICAgIG9wdGlvbnMsXG4gIClcbiAgcHJldmlvdXNBY3RpdmVQYW5lLmFjdGl2YXRlKClcbiAgcmV0dXJuIHJlc1xufVxuXG5hc3luYyBmdW5jdGlvbiBwcmV2aWV3RmlsZSh7IGN1cnJlbnRUYXJnZXQgfTogQ29tbWFuZEV2ZW50KSB7XG4gIGNvbnN0IGZpbGVQYXRoID0gKGN1cnJlbnRUYXJnZXQgYXMgSFRNTEVsZW1lbnQpLmRhdGFzZXQucGF0aFxuICBpZiAoIWZpbGVQYXRoKSB7XG4gICAgcmV0dXJuIHVuZGVmaW5lZFxuICB9XG5cbiAgZm9yIChjb25zdCBlZGl0b3Igb2YgYXRvbS53b3Jrc3BhY2UuZ2V0VGV4dEVkaXRvcnMoKSkge1xuICAgIGlmIChlZGl0b3IuZ2V0UGF0aCgpID09PSBmaWxlUGF0aCkge1xuICAgICAgcmV0dXJuIGFkZFByZXZpZXdGb3JFZGl0b3IoZWRpdG9yKVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBhdG9tLndvcmtzcGFjZS5vcGVuKFxuICAgIGBtYXJrZG93bi1wcmV2aWV3LXBsdXM6Ly9maWxlLyR7ZW5jb2RlVVJJKGZpbGVQYXRoKX1gLFxuICAgIHtcbiAgICAgIHNlYXJjaEFsbFBhbmVzOiB0cnVlLFxuICAgIH0sXG4gIClcbn1cblxuYXN5bmMgZnVuY3Rpb24gY29weUh0bWxJbnRlcm5hbChlZGl0b3I6IFRleHRFZGl0b3IpOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3QgdGV4dCA9IGVkaXRvci5nZXRTZWxlY3RlZFRleHQoKSB8fCBlZGl0b3IuZ2V0VGV4dCgpXG4gIGNvbnN0IHJlbmRlckxhVGVYID0gYXRvbS5jb25maWcuZ2V0KFxuICAgICdtYXJrZG93bi1wcmV2aWV3LXBsdXMuZW5hYmxlTGF0ZXhSZW5kZXJpbmdCeURlZmF1bHQnLFxuICApXG4gIGNvbnN0IGh0bWwgPSBhd2FpdCByZW5kZXJlci50b0hUTUwoXG4gICAgdGV4dCxcbiAgICBlZGl0b3IuZ2V0UGF0aCgpLFxuICAgIGVkaXRvci5nZXRHcmFtbWFyKCksXG4gICAgISFyZW5kZXJMYVRlWCxcbiAgICB0cnVlLFxuICApXG4gIGlmIChyZW5kZXJMYVRlWCkge1xuICAgIGNvbnN0IGZyYW1lID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaWZyYW1lJylcbiAgICBmcmFtZS5zcmMgPSAnYWJvdXQ6YmxhbmsnXG4gICAgZnJhbWUuc3R5bGUuZGlzcGxheSA9ICdub25lJ1xuICAgIGZyYW1lLmFkZEV2ZW50TGlzdGVuZXIoJ2xvYWQnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBwcm9IVE1MID0gYXdhaXQgbWF0aGpheEhlbHBlci5wcm9jZXNzSFRNTFN0cmluZyhmcmFtZSwgaHRtbC5ib2R5KVxuICAgICAgZnJhbWUucmVtb3ZlKClcbiAgICAgIGF0b20uY2xpcGJvYXJkLndyaXRlKHByb0hUTUwpXG4gICAgfSlcbiAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGZyYW1lKVxuICB9IGVsc2Uge1xuICAgIGF0b20uY2xpcGJvYXJkLndyaXRlKGh0bWwuYm9keS5pbm5lckhUTUwpXG4gIH1cbn1cblxudHlwZSBDb250ZXh0TWVudSA9IHsgW2tleTogc3RyaW5nXTogQ29udGV4dE1lbnVPcHRpb25zW10gfVxuXG5mdW5jdGlvbiBjb25maWdPYnNlcnZlcjxUPihcbiAgZjogKFxuICAgIHZhbHVlOiBULFxuICAgIGRpc3Bvc2FibGVzOiBDb21wb3NpdGVEaXNwb3NhYmxlLFxuICAgIGNvbnRleHRNZW51OiBDb250ZXh0TWVudSxcbiAgKSA9PiB2b2lkLFxuKSB7XG4gIGxldCBjb25maWdEaXNwb3NhYmxlczogQ29tcG9zaXRlRGlzcG9zYWJsZVxuICByZXR1cm4gZnVuY3Rpb24odmFsdWU6IFQpIHtcbiAgICBpZiAoIWRpc3Bvc2FibGVzKSByZXR1cm5cbiAgICBpZiAoY29uZmlnRGlzcG9zYWJsZXMpIHtcbiAgICAgIGNvbmZpZ0Rpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuICAgICAgZGlzcG9zYWJsZXMucmVtb3ZlKGNvbmZpZ0Rpc3Bvc2FibGVzKVxuICAgIH1cbiAgICBjb25maWdEaXNwb3NhYmxlcyA9IG5ldyBDb21wb3NpdGVEaXNwb3NhYmxlKClcbiAgICBjb25zdCBjb250ZXh0TWVudTogQ29udGV4dE1lbnUgPSB7fVxuICAgIGYodmFsdWUsIGNvbmZpZ0Rpc3Bvc2FibGVzLCBjb250ZXh0TWVudSlcbiAgICBjb25maWdEaXNwb3NhYmxlcy5hZGQoYXRvbS5jb250ZXh0TWVudS5hZGQoY29udGV4dE1lbnUpKVxuICAgIGRpc3Bvc2FibGVzLmFkZChjb25maWdEaXNwb3NhYmxlcylcbiAgfVxufVxuXG5mdW5jdGlvbiByZWdpc3RlckV4dGVuc2lvbnMoXG4gIGV4dGVuc2lvbnM6IHN0cmluZ1tdLFxuICBkaXNwOiBDb21wb3NpdGVEaXNwb3NhYmxlLFxuICBjbTogQ29udGV4dE1lbnUsXG4pIHtcbiAgZm9yIChjb25zdCBleHQgb2YgZXh0ZW5zaW9ucykge1xuICAgIGNvbnN0IHNlbGVjdG9yID0gYC50cmVlLXZpZXcgLmZpbGUgLm5hbWVbZGF0YS1uYW1lJD1cIi4ke2V4dH1cIl1gXG4gICAgZGlzcC5hZGQoXG4gICAgICBhdG9tLmNvbW1hbmRzLmFkZChcbiAgICAgICAgc2VsZWN0b3IsXG4gICAgICAgICdtYXJrZG93bi1wcmV2aWV3LXBsdXM6cHJldmlldy1maWxlJyxcbiAgICAgICAgcHJldmlld0ZpbGUsXG4gICAgICApLFxuICAgIClcbiAgICBjbVtzZWxlY3Rvcl0gPSBbXG4gICAgICB7XG4gICAgICAgIGxhYmVsOiAnTWFya2Rvd24gUHJldmlldycsXG4gICAgICAgIGNvbW1hbmQ6ICdtYXJrZG93bi1wcmV2aWV3LXBsdXM6cHJldmlldy1maWxlJyxcbiAgICAgIH0sXG4gICAgXVxuICB9XG59XG5cbmZ1bmN0aW9uIHJlZ2lzdGVyR3JhbW1hcnMoXG4gIGdyYW1tYXJzOiBzdHJpbmdbXSxcbiAgZGlzcDogQ29tcG9zaXRlRGlzcG9zYWJsZSxcbiAgY206IENvbnRleHRNZW51LFxuKSB7XG4gIGZvciAoY29uc3QgZ3Igb2YgZ3JhbW1hcnMpIHtcbiAgICBjb25zdCBncnMgPSBnci5yZXBsYWNlKC9cXC4vZywgJyAnKVxuICAgIGNvbnN0IHNlbGVjdG9yID0gYGF0b20tdGV4dC1lZGl0b3JbZGF0YS1ncmFtbWFyPVwiJHtncnN9XCJdYFxuICAgIGRpc3AuYWRkKFxuICAgICAgYXRvbS5jb21tYW5kcy5hZGQoc2VsZWN0b3IgYXMgJ2F0b20tdGV4dC1lZGl0b3InLCB7XG4gICAgICAgICdtYXJrZG93bi1wcmV2aWV3LXBsdXM6dG9nZ2xlJzogKGUpID0+IHtcbiAgICAgICAgICBoYW5kbGVQcm9taXNlKHRvZ2dsZShlLmN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKSkpXG4gICAgICAgIH0sXG4gICAgICAgICdtYXJrZG93bi1wcmV2aWV3LXBsdXM6Y29weS1odG1sJzogKGUpID0+IHtcbiAgICAgICAgICBoYW5kbGVQcm9taXNlKGNvcHlIdG1sSW50ZXJuYWwoZS5jdXJyZW50VGFyZ2V0LmdldE1vZGVsKCkpKVxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgKVxuICAgIGNtW3NlbGVjdG9yXSA9IFtcbiAgICAgIHtcbiAgICAgICAgbGFiZWw6ICdTeW5jIFByZXZpZXcnLFxuICAgICAgICBjb21tYW5kOiAnbWFya2Rvd24tcHJldmlldy1wbHVzOnN5bmMtcHJldmlldycsXG4gICAgICB9LFxuICAgIF1cbiAgfVxufVxuXG5mdW5jdGlvbiBvcGVuZXIodXJpVG9PcGVuOiBzdHJpbmcpIHtcbiAgdHJ5IHtcbiAgICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6bm8tdmFyLWtleXdvcmQgcHJlZmVyLWNvbnN0XG4gICAgdmFyIHVyaSA9IHVybC5wYXJzZSh1cmlUb09wZW4pXG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBjb25zb2xlLmVycm9yKGUsIHVyaVRvT3BlbilcbiAgICByZXR1cm4gdW5kZWZpbmVkXG4gIH1cblxuICBpZiAodXJpLnByb3RvY29sICE9PSAnbWFya2Rvd24tcHJldmlldy1wbHVzOicpIHJldHVybiB1bmRlZmluZWRcbiAgaWYgKCF1cmkucGF0aG5hbWUpIHJldHVybiB1bmRlZmluZWRcblxuICB0cnkge1xuICAgIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTpuby12YXIta2V5d29yZCBwcmVmZXItY29uc3RcbiAgICB2YXIgcGF0aG5hbWUgPSBkZWNvZGVVUkkodXJpLnBhdGhuYW1lKVxuICB9IGNhdGNoIChlKSB7XG4gICAgY29uc29sZS5lcnJvcihlKVxuICAgIHJldHVybiB1bmRlZmluZWRcbiAgfVxuXG4gIGlmICh1cmkuaG9zdG5hbWUgPT09ICdmaWxlJykge1xuICAgIHJldHVybiBuZXcgTWFya2Rvd25QcmV2aWV3Vmlld0ZpbGUocGF0aG5hbWUuc2xpY2UoMSkpXG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgYFRyaWVkIHRvIG9wZW4gbWFya2Rvd24tcHJldmlldy1wbHVzIHdpdGggdXJpICR7dXJpVG9PcGVufS4gVGhpcyBpcyBub3Qgc3VwcG9ydGVkLiBQbGVhc2UgcmVwb3J0IHRoaXMgZXJyb3IuYCxcbiAgICApXG4gIH1cbn1cbiJdfQ==