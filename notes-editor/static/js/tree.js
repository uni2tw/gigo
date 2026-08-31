window.NotesTree = (function () {
  var container = null;
  var onSelect = null;
  var onFolderClick = null;
  var selectedPath = null;
  var currentTree = [];
  var expandedPaths = {};
  var openDropdown = null;

  var ICON_FOLDER = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a1 1 0 0 1 1-1h4l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7z"/></svg>';
  var ICON_NOTE = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/></svg>';
  var ICON_NEW_FILE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/><path d="M12 12v6M9 15h6"/></svg>';
  var ICON_RENAME = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
  var ICON_MOVE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a1 1 0 0 1 1-1h4l2 2h9a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7z"/><path d="M9 13h6M12 10l3 3-3 3"/></svg>';
  var ICON_DELETE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/><path d="M10 11v6M14 11v6"/></svg>';

  var NOTE_ACTIONS = [
    { label: '重新命名', icon: ICON_RENAME, run: 'rename' },
    { label: '搬移', icon: ICON_MOVE, run: 'move' },
    { label: '刪除', icon: ICON_DELETE, run: 'delete' },
  ];

  var FOLDER_ACTIONS = [
    { label: '新文件', icon: ICON_NEW_FILE, run: 'newNote' },
  ].concat(NOTE_ACTIONS);

  function countNotes(node) {
    var count = 0;
    (node.children || []).forEach(function (child) {
      if (child.type === 'note') {
        count += 1;
      } else if (child.type === 'folder') {
        count += countNotes(child);
      }
    });
    return count;
  }

  function closeOpenDropdown() {
    if (openDropdown) {
      openDropdown.hidden = true;
      openDropdown = null;
    }
  }

  function init(containerEl, callbacks) {
    container = containerEl;
    onSelect = callbacks.onSelect;
    onFolderClick = callbacks.onFolderClick;

    document.addEventListener('click', function () {
      closeOpenDropdown();
    });

    container.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      container.classList.add('drag-over-root');
    });
    container.addEventListener('dragleave', function (e) {
      if (e.target === container) {
        container.classList.remove('drag-over-root');
      }
    });
    container.addEventListener('drop', function (e) {
      e.preventDefault();
      container.classList.remove('drag-over-root');
      var sourcePath = e.dataTransfer.getData('text/plain');
      handleDropOnRoot(sourcePath);
    });
  }

  function setTree(newTree) {
    currentTree = newTree;
    render();
  }

  function setSelected(path) {
    selectedPath = path;
    render();
  }

  function revealPath(path) {
    var parts = path.split('/');
    parts.pop();
    var acc = '';
    parts.forEach(function (part) {
      acc = acc ? acc + '/' + part : part;
      expandedPaths[acc] = true;
    });
    render();
  }

  function render() {
    openDropdown = null;
    container.innerHTML = '';
    container.appendChild(renderNodes(currentTree));
  }

  function renderNodes(nodes) {
    var wrapper = document.createElement('div');
    nodes.forEach(function (node) {
      wrapper.appendChild(renderNode(node));
    });
    return wrapper;
  }

  function renderNode(node) {
    var el = document.createElement('div');
    el.className = 'tree-node';

    var row = document.createElement('div');
    row.className = 'tree-node-row' + (node.path === selectedPath ? ' selected' : '');

    var toggle = document.createElement('span');
    toggle.className = 'tree-toggle';
    var hasChildren = node.type === 'folder' && node.children && node.children.length > 0;

    var isExpanded = !!expandedPaths[node.path];
    if (node.type === 'folder') {
      toggle.textContent = hasChildren ? (isExpanded ? '▾' : '▸') : '';
    } else {
      toggle.textContent = '';
    }

    var icon = document.createElement('span');
    icon.className = 'tree-node-icon';
    icon.innerHTML = node.type === 'folder' ? ICON_FOLDER : ICON_NOTE;

    var label = document.createElement('span');
    label.className = 'tree-node-label';
    label.textContent = node.name;

    row.appendChild(toggle);
    row.appendChild(icon);
    row.appendChild(label);

    var trailing = document.createElement('span');
    trailing.className = 'tree-node-trailing';

    if (node.type === 'folder') {
      var noteCount = countNotes(node);
      if (noteCount > 0) {
        var countBadge = document.createElement('span');
        countBadge.className = 'tree-node-count';
        countBadge.textContent = String(noteCount);
        trailing.appendChild(countBadge);
      }
    }

    trailing.appendChild(renderActionMenu(node));
    row.appendChild(trailing);

    row.addEventListener('click', function () {
      if (node.type === 'folder') {
        expandedPaths[node.path] = !expandedPaths[node.path];
        render();
        if (onFolderClick) {
          onFolderClick(node);
        }
      } else if (onSelect) {
        onSelect(node);
      }
    });

    row.draggable = true;
    row.addEventListener('dragstart', function (e) {
      e.dataTransfer.setData('text/plain', node.path);
      e.dataTransfer.effectAllowed = 'move';
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', function () {
      row.classList.remove('dragging');
    });

    if (node.type === 'folder') {
      row.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        row.classList.add('drag-over');
      });
      row.addEventListener('dragleave', function () {
        row.classList.remove('drag-over');
      });
      row.addEventListener('drop', function (e) {
        e.preventDefault();
        e.stopPropagation();
        row.classList.remove('drag-over');
        var sourcePath = e.dataTransfer.getData('text/plain');
        handleDropOnFolder(sourcePath, node);
      });
    }

    el.appendChild(row);

    if (node.type === 'folder' && isExpanded && node.children) {
      var childrenEl = document.createElement('div');
      childrenEl.className = 'tree-node-children';
      childrenEl.appendChild(renderNodes(node.children));
      el.appendChild(childrenEl);
    }

    return el;
  }

  function renderActionMenu(node) {
    var wrapper = document.createElement('div');
    wrapper.className = 'tree-action-menu';

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'tree-action-trigger';
    trigger.title = '更多操作';
    trigger.textContent = '⋮';

    var dropdown = document.createElement('div');
    dropdown.className = 'tree-action-dropdown';
    dropdown.hidden = true;

    var actions = node.type === 'folder' ? FOLDER_ACTIONS : NOTE_ACTIONS;
    var blockDelete = node.type === 'folder' && countNotes(node) > 0;

    actions.forEach(function (action) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.innerHTML = action.icon + '<span>' + action.label + '</span>';
      if (action.run === 'delete' && blockDelete) {
        btn.disabled = true;
        btn.title = '資料夾內還有筆記，請先清空才能刪除';
      }
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        closeOpenDropdown();
        if (action.run === 'newNote') {
          handleNewNote(node);
        } else if (action.run === 'rename') {
          handleRename(node);
        } else if (action.run === 'move') {
          handleMove(node);
        } else if (action.run === 'delete') {
          handleDelete(node);
        }
      });
      dropdown.appendChild(btn);
    });

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      if (openDropdown === dropdown) {
        closeOpenDropdown();
        return;
      }
      closeOpenDropdown();
      dropdown.hidden = false;
      openDropdown = dropdown;
    });

    wrapper.appendChild(trigger);
    wrapper.appendChild(dropdown);
    return wrapper;
  }

  function parentDirOf(path) {
    var parts = path.split('/');
    parts.pop();
    return parts.join('/');
  }

  function basenameOf(path) {
    var parts = path.split('/');
    return parts[parts.length - 1];
  }

  function performMove(sourcePath, newPath) {
    window.NotesApi.updateNode(sourcePath, newPath)
      .then(function () {
        window.NotesApp.onNodeMoved(sourcePath, newPath);
      })
      .catch(function (err) {
        window.alert(err.message);
      });
  }

  function handleDropOnFolder(sourcePath, targetFolder) {
    if (!sourcePath) {
      return;
    }
    var newPath = (targetFolder.path ? targetFolder.path + '/' : '') + basenameOf(sourcePath);
    if (newPath === sourcePath || sourcePath === targetFolder.path) {
      return;
    }
    performMove(sourcePath, newPath);
  }

  function handleDropOnRoot(sourcePath) {
    if (!sourcePath) {
      return;
    }
    var newPath = basenameOf(sourcePath);
    if (newPath === sourcePath) {
      return;
    }
    performMove(sourcePath, newPath);
  }

  function handleNewNote(node) {
    window.NotesModal.prompt('新筆記名稱').then(function (name) {
      if (!name) {
        return;
      }
      window.NotesApi.createNode(node.path, name, 'note')
        .then(function () {
          expandedPaths[node.path] = true;
          window.NotesApp.reloadTree();
        })
        .catch(function (err) {
          window.alert(err.message);
        });
    });
  }

  function handleRename(node) {
    window.NotesModal.prompt('輸入新名稱', node.name).then(function (newName) {
      if (!newName || newName === node.name) {
        return;
      }
      var parentDir = parentDirOf(node.path);
      var ext = node.type === 'note' ? '.md' : '';
      var newPath = (parentDir ? parentDir + '/' : '') + newName + ext;
      performMove(node.path, newPath);
    });
  }

  function handleDelete(node) {
    window.NotesModal.confirm('確定要刪除「' + node.name + '」嗎？此操作無法復原。').then(function (ok) {
      if (!ok) {
        return;
      }
      window.NotesApi.deleteNode(node.path)
        .then(function () {
          window.NotesApp.onNodeDeleted(node.path);
        })
        .catch(function (err) {
          window.alert(err.message);
        });
    });
  }

  function handleMove(node) {
    window.NotesModal.prompt('輸入目標路徑（相對於筆記根目錄）', node.path).then(function (targetPath) {
      if (!targetPath || targetPath === node.path) {
        return;
      }
      performMove(node.path, targetPath);
    });
  }

  return {
    init: init,
    setTree: setTree,
    setSelected: setSelected,
    revealPath: revealPath,
  };
})();
