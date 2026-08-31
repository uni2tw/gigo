window.NotesApi = (function () {
  function request(url, options) {
    return fetch(url, options).then(function (res) {
      if (res.status === 204) {
        return null;
      }
      return res.json().catch(function () {
        return {};
      }).then(function (body) {
        if (!res.ok) {
          var err = new Error((body && body.error) || ('Request failed: ' + res.status));
          err.status = res.status;
          throw err;
        }
        return body;
      });
    });
  }

  function getTree() {
    return request('/api/tree', { method: 'GET' });
  }

  function createNode(parent, name, type) {
    return request('/api/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent: parent, name: name, type: type }),
    });
  }

  function updateNode(path, target) {
    return request('/api/nodes/' + encodeURI(path), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: target }),
    });
  }

  function deleteNode(path) {
    return request('/api/nodes/' + encodeURI(path), { method: 'DELETE' });
  }

  function getNote(path) {
    return request('/api/notes/' + encodeURI(path), { method: 'GET' });
  }

  function saveNote(path, blocks) {
    return request('/api/notes/' + encodeURI(path), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks: blocks }),
    });
  }

  function uploadImage(notePath, file) {
    var formData = new FormData();
    formData.append('file', file);
    return request('/api/notes/' + encodeURI(notePath) + '/images', {
      method: 'POST',
      body: formData,
    });
  }

  function fileUrl(relPath) {
    return '/api/files/' + relPath.split('/').map(encodeURIComponent).join('/');
  }

  return {
    getTree: getTree,
    createNode: createNode,
    updateNode: updateNode,
    deleteNode: deleteNode,
    getNote: getNote,
    saveNote: saveNote,
    uploadImage: uploadImage,
    fileUrl: fileUrl,
  };
})();
