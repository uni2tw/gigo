(function () {
  var currentNode = null;
  var activeParentPath = '';
  var saveTimer = null;
  var saveStatusEl = null;
  var viewMode = 'block';
  var blockEditorEl = null;
  var sourceEditorEl = null;
  var toggleSourceBtn = null;

  function parentDirOf(path) {
    var parts = path.split('/');
    parts.pop();
    return parts.join('/');
  }

  function reloadTree() {
    return window.NotesApi.getTree().then(function (data) {
      window.NotesTree.setTree(data.tree);
    }).catch(function (err) {
      window.alert('讀取樹狀結構失敗：' + err.message);
    });
  }

  function selectNode(node) {
    currentNode = node;
    activeParentPath = parentDirOf(node.path);
    window.NotesTree.setSelected(node.path);
    document.getElementById('editor-empty').hidden = true;
    document.getElementById('editor-content').hidden = false;
    document.getElementById('note-title').textContent = node.name;
    resetViewMode();
    setStatus('載入中…');

    window.NotesApi.getNote(node.path).then(function (data) {
      window.NotesEditor.load(data.blocks);
      setStatus('');
    }).catch(function (err) {
      setStatus('載入失敗：' + err.message);
    });
  }

  function resetViewMode() {
    viewMode = 'block';
    blockEditorEl.hidden = false;
    sourceEditorEl.hidden = true;
    sourceEditorEl.value = '';
    toggleSourceBtn.textContent = '檢視原始碼';
  }

  function setViewMode(mode) {
    viewMode = mode;
    if (mode === 'source') {
      sourceEditorEl.value = window.NotesEditor.getMarkdownSource();
      blockEditorEl.hidden = true;
      sourceEditorEl.hidden = false;
      toggleSourceBtn.textContent = '切換為區塊編輯';
    } else {
      window.NotesEditor.loadFromMarkdownSource(sourceEditorEl.value);
      blockEditorEl.hidden = false;
      sourceEditorEl.hidden = true;
      toggleSourceBtn.textContent = '檢視原始碼';
    }
  }

  function toggleViewMode() {
    setViewMode(viewMode === 'block' ? 'source' : 'block');
  }

  function setStatus(text) {
    if (saveStatusEl) {
      saveStatusEl.textContent = text;
    }
  }

  function scheduleSave() {
    if (!currentNode) {
      return;
    }
    setStatus('編輯中…');
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(function () {
      if (viewMode === 'source') {
        window.NotesEditor.loadFromMarkdownSource(sourceEditorEl.value);
      }
      var blocks = window.NotesEditor.getBlocks();
      var savingNode = currentNode;
      window.NotesApi.saveNote(savingNode.path, blocks).then(function () {
        if (currentNode === savingNode) {
          setStatus('已儲存 ' + new Date().toLocaleTimeString());
        }
      }).catch(function (err) {
        if (currentNode === savingNode) {
          setStatus('儲存失敗，內容尚未儲存：' + err.message);
        }
      });
    }, 800);
  }

  function onFolderClicked(node) {
    activeParentPath = node.path;
    window.NotesTree.setSelected(node.path);
  }

  function promptCreate(type) {
    window.NotesModal.prompt(type === 'folder' ? '新資料夾名稱' : '新筆記名稱').then(function (name) {
      if (!name) {
        return;
      }
      window.NotesApi.createNode(activeParentPath, name, type).then(function () {
        reloadTree();
      }).catch(function (err) {
        window.alert(err.message);
      });
    });
  }

  function onNodeDeleted(path) {
    if (currentNode && (currentNode.path === path || currentNode.path.indexOf(path + '/') === 0)) {
      currentNode = null;
      document.getElementById('editor-empty').hidden = false;
      document.getElementById('editor-content').hidden = true;
    }
    reloadTree();
  }

  function onNodeMoved(oldPath, newPath) {
    if (currentNode && currentNode.path === oldPath) {
      currentNode.path = newPath;
    }
    reloadTree();
  }

  document.addEventListener('DOMContentLoaded', function () {
    saveStatusEl = document.getElementById('save-status');
    blockEditorEl = document.getElementById('block-editor');
    sourceEditorEl = document.getElementById('source-editor');
    toggleSourceBtn = document.getElementById('btn-toggle-source');

    window.NotesTree.init(document.getElementById('tree-root'), {
      onSelect: selectNode,
      onFolderClick: onFolderClicked,
    });
    window.NotesEditor.init(blockEditorEl, {
      onChange: scheduleSave,
    });

    document.getElementById('btn-new-folder').addEventListener('click', function () {
      promptCreate('folder');
    });
    document.getElementById('btn-new-note').addEventListener('click', function () {
      promptCreate('note');
    });
    toggleSourceBtn.addEventListener('click', toggleViewMode);
    sourceEditorEl.addEventListener('input', scheduleSave);

    reloadTree();
  });

  window.NotesApp = {
    reloadTree: reloadTree,
    onNodeDeleted: onNodeDeleted,
    onNodeMoved: onNodeMoved,
  };
})();
