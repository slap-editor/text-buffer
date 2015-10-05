(function() {
  var Checkpoint, GroupEnd, GroupStart, History, SerializationVersion;

  SerializationVersion = 3;

  Checkpoint = (function() {
    function Checkpoint(id, snapshot, isBoundary) {
      var _ref;
      this.id = id;
      this.snapshot = snapshot;
      this.isBoundary = isBoundary;
      if (this.snapshot == null) {
        if ((_ref = global.atom) != null) {
          _ref.assert(false, "Checkpoint created without snapshot");
        }
        this.snapshot = {};
      }
    }

    return Checkpoint;

  })();

  GroupStart = (function() {
    function GroupStart(snapshot) {
      this.snapshot = snapshot;
    }

    return GroupStart;

  })();

  GroupEnd = (function() {
    function GroupEnd(snapshot) {
      this.snapshot = snapshot;
      this.timestamp = Date.now();
      this.groupingInterval = 0;
    }

    return GroupEnd;

  })();

  module.exports = History = (function() {
    History.deserialize = function(delegate, state) {
      var history;
      history = new History(delegate);
      history.deserialize(state);
      return history;
    };

    function History(delegate, maxUndoEntries) {
      this.delegate = delegate;
      this.maxUndoEntries = maxUndoEntries;
      this.nextCheckpointId = 0;
      this.undoStack = [];
      this.redoStack = [];
    }

    History.prototype.createCheckpoint = function(snapshot, isBoundary) {
      var checkpoint;
      checkpoint = new Checkpoint(this.nextCheckpointId++, snapshot, isBoundary);
      this.undoStack.push(checkpoint);
      return checkpoint.id;
    };

    History.prototype.groupChangesSinceCheckpoint = function(checkpointId, endSnapshot, deleteCheckpoint) {
      var changesSinceCheckpoint, checkpointIndex, entry, i, startSnapshot, withinGroup, _i, _ref, _ref1;
      if (deleteCheckpoint == null) {
        deleteCheckpoint = false;
      }
      withinGroup = false;
      checkpointIndex = null;
      startSnapshot = null;
      changesSinceCheckpoint = [];
      _ref = this.undoStack;
      for (i = _i = _ref.length - 1; _i >= 0; i = _i += -1) {
        entry = _ref[i];
        if (checkpointIndex != null) {
          break;
        }
        switch (entry.constructor) {
          case GroupEnd:
            withinGroup = true;
            break;
          case GroupStart:
            if (withinGroup) {
              withinGroup = false;
            } else {
              return false;
            }
            break;
          case Checkpoint:
            if (entry.id === checkpointId) {
              checkpointIndex = i;
              startSnapshot = entry.snapshot;
            } else if (entry.isBoundary) {
              return false;
            }
            break;
          default:
            changesSinceCheckpoint.unshift(entry);
        }
      }
      if (checkpointIndex != null) {
        if (changesSinceCheckpoint.length > 0) {
          this.undoStack.splice(checkpointIndex + 1);
          this.undoStack.push(new GroupStart(startSnapshot));
          (_ref1 = this.undoStack).push.apply(_ref1, changesSinceCheckpoint);
          this.undoStack.push(new GroupEnd(endSnapshot));
        }
        if (deleteCheckpoint) {
          this.undoStack.splice(checkpointIndex, 1);
        }
        return true;
      } else {
        return false;
      }
    };

    History.prototype.applyGroupingInterval = function(groupingInterval) {
      var entry, i, previousEntry, topEntry, _i, _ref;
      topEntry = this.undoStack[this.undoStack.length - 1];
      if (topEntry instanceof GroupEnd) {
        topEntry.groupingInterval = groupingInterval;
      } else {
        return;
      }
      if (groupingInterval === 0) {
        return;
      }
      _ref = this.undoStack;
      for (i = _i = _ref.length - 1; _i >= 0; i = _i += -1) {
        entry = _ref[i];
        if (entry instanceof GroupStart) {
          previousEntry = this.undoStack[i - 1];
          if (previousEntry instanceof GroupEnd) {
            if (topEntry.timestamp - previousEntry.timestamp < Math.min(previousEntry.groupingInterval, groupingInterval)) {
              this.undoStack.splice(i - 1, 2);
            }
          }
          return;
        }
      }
      throw new Error("Didn't find matching group-start entry");
    };

    History.prototype.pushChange = function(change) {
      var entry, i, spliceIndex, withinGroup, _i, _len, _ref;
      this.undoStack.push(change);
      this.clearRedoStack();
      if (this.undoStack.length - this.maxUndoEntries > 0) {
        spliceIndex = null;
        withinGroup = false;
        _ref = this.undoStack;
        for (i = _i = 0, _len = _ref.length; _i < _len; i = ++_i) {
          entry = _ref[i];
          if (spliceIndex != null) {
            break;
          }
          switch (entry.constructor) {
            case GroupStart:
              if (withinGroup) {
                throw new Error("Invalid undo stack state");
              } else {
                withinGroup = true;
              }
              break;
            case GroupEnd:
              if (withinGroup) {
                spliceIndex = i;
              } else {
                throw new Error("Invalid undo stack state");
              }
          }
        }
        if (spliceIndex != null) {
          return this.undoStack.splice(0, spliceIndex + 1);
        }
      }
    };

    History.prototype.popUndoStack = function() {
      var entry, i, invertedChanges, snapshotBelow, spliceIndex, withinGroup, _i, _ref, _ref1;
      snapshotBelow = null;
      spliceIndex = null;
      withinGroup = false;
      invertedChanges = [];
      _ref = this.undoStack;
      for (i = _i = _ref.length - 1; _i >= 0; i = _i += -1) {
        entry = _ref[i];
        if (spliceIndex != null) {
          break;
        }
        switch (entry.constructor) {
          case GroupStart:
            if (withinGroup) {
              snapshotBelow = entry.snapshot;
              spliceIndex = i;
            } else {
              return false;
            }
            break;
          case GroupEnd:
            if (withinGroup) {
              throw new Error("Invalid undo stack state");
            } else {
              withinGroup = true;
            }
            break;
          case Checkpoint:
            if (entry.isBoundary) {
              return false;
            }
            break;
          default:
            invertedChanges.push(this.delegate.invertChange(entry));
            if (!withinGroup) {
              spliceIndex = i;
            }
        }
      }
      if (spliceIndex != null) {
        (_ref1 = this.redoStack).push.apply(_ref1, this.undoStack.splice(spliceIndex).reverse());
        return {
          snapshot: snapshotBelow,
          changes: invertedChanges
        };
      } else {
        return false;
      }
    };

    History.prototype.popRedoStack = function() {
      var changes, entry, i, snapshotBelow, spliceIndex, withinGroup, _i, _ref, _ref1;
      snapshotBelow = null;
      spliceIndex = null;
      withinGroup = false;
      changes = [];
      _ref = this.redoStack;
      for (i = _i = _ref.length - 1; _i >= 0; i = _i += -1) {
        entry = _ref[i];
        if (spliceIndex != null) {
          break;
        }
        switch (entry.constructor) {
          case GroupEnd:
            if (withinGroup) {
              snapshotBelow = entry.snapshot;
              spliceIndex = i;
            } else {
              return false;
            }
            break;
          case GroupStart:
            if (withinGroup) {
              throw new Error("Invalid redo stack state");
            } else {
              withinGroup = true;
            }
            break;
          case Checkpoint:
            if (entry.isBoundary) {
              throw new Error("Invalid redo stack state");
            }
            break;
          default:
            changes.push(entry);
            if (!withinGroup) {
              spliceIndex = i;
            }
        }
      }
      while (this.redoStack[spliceIndex - 1] instanceof Checkpoint) {
        spliceIndex--;
      }
      if (spliceIndex != null) {
        (_ref1 = this.undoStack).push.apply(_ref1, this.redoStack.splice(spliceIndex).reverse());
        return {
          snapshot: snapshotBelow,
          changes: changes
        };
      } else {
        return false;
      }
    };

    History.prototype.truncateUndoStack = function(checkpointId) {
      var entry, i, invertedChanges, snapshotBelow, spliceIndex, withinGroup, _i, _ref;
      snapshotBelow = null;
      spliceIndex = null;
      withinGroup = false;
      invertedChanges = [];
      _ref = this.undoStack;
      for (i = _i = _ref.length - 1; _i >= 0; i = _i += -1) {
        entry = _ref[i];
        if (spliceIndex != null) {
          break;
        }
        switch (entry.constructor) {
          case GroupStart:
            if (withinGroup) {
              withinGroup = false;
            } else {
              return false;
            }
            break;
          case GroupEnd:
            if (withinGroup) {
              throw new Error("Invalid undo stack state");
            } else {
              withinGroup = true;
            }
            break;
          case Checkpoint:
            if (entry.id === checkpointId) {
              spliceIndex = i;
              snapshotBelow = entry.snapshot;
            } else if (entry.isBoundary) {
              return false;
            }
            break;
          default:
            invertedChanges.push(this.delegate.invertChange(entry));
        }
      }
      if (spliceIndex != null) {
        this.undoStack.splice(spliceIndex);
        return {
          snapshot: snapshotBelow,
          changes: invertedChanges
        };
      } else {
        return false;
      }
    };

    History.prototype.clearUndoStack = function() {
      return this.undoStack.length = 0;
    };

    History.prototype.clearRedoStack = function() {
      return this.redoStack.length = 0;
    };

    History.prototype.serialize = function() {
      return {
        version: SerializationVersion,
        nextCheckpointId: this.nextCheckpointId,
        undoStack: this.serializeStack(this.undoStack),
        redoStack: this.serializeStack(this.redoStack)
      };
    };

    History.prototype.deserialize = function(state) {
      if (state.version !== SerializationVersion) {
        return;
      }
      this.nextCheckpointId = state.nextCheckpointId;
      this.maxUndoEntries = state.maxUndoEntries;
      this.undoStack = this.deserializeStack(state.undoStack);
      return this.redoStack = this.deserializeStack(state.redoStack);
    };


    /*
    Section: Private
     */

    History.prototype.getCheckpointIndex = function(checkpointId) {
      var entry, i, _i, _ref;
      _ref = this.undoStack;
      for (i = _i = _ref.length - 1; _i >= 0; i = _i += -1) {
        entry = _ref[i];
        if (entry instanceof Checkpoint && entry.id === checkpointId) {
          return i;
        }
      }
      return null;
    };

    History.prototype.serializeStack = function(stack) {
      var entry, _i, _len, _results;
      _results = [];
      for (_i = 0, _len = stack.length; _i < _len; _i++) {
        entry = stack[_i];
        switch (entry.constructor) {
          case Checkpoint:
            _results.push({
              type: 'checkpoint',
              id: entry.id,
              snapshot: this.delegate.serializeSnapshot(entry.snapshot),
              isBoundary: entry.isBoundary
            });
            break;
          case GroupStart:
            _results.push({
              type: 'group-start',
              snapshot: this.delegate.serializeSnapshot(entry.snapshot)
            });
            break;
          case GroupEnd:
            _results.push({
              type: 'group-end',
              snapshot: this.delegate.serializeSnapshot(entry.snapshot)
            });
            break;
          default:
            _results.push({
              type: 'change',
              content: this.delegate.serializeChange(entry)
            });
        }
      }
      return _results;
    };

    History.prototype.deserializeStack = function(stack) {
      var entry, _i, _len, _results;
      _results = [];
      for (_i = 0, _len = stack.length; _i < _len; _i++) {
        entry = stack[_i];
        switch (entry.type) {
          case 'checkpoint':
            _results.push(new Checkpoint(entry.id, this.delegate.deserializeSnapshot(entry.snapshot), entry.isBoundary));
            break;
          case 'group-start':
            _results.push(new GroupStart(this.delegate.deserializeSnapshot(entry.snapshot)));
            break;
          case 'group-end':
            _results.push(new GroupEnd(this.delegate.deserializeSnapshot(entry.snapshot)));
            break;
          case 'change':
            _results.push(this.delegate.deserializeChange(entry.content));
            break;
          default:
            _results.push(void 0);
        }
      }
      return _results;
    };

    return History;

  })();

}).call(this);
