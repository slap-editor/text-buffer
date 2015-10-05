(function() {
  var Marker, MarkerIndex, MarkerStore, Point, Range, SerializationVersion, clone, filterSet, intersectSet;

  clone = require("underscore-plus").clone;

  Point = require("./point");

  Range = require("./range");

  Marker = require("./marker");

  MarkerIndex = require("./marker-index");

  intersectSet = require("./set-helpers").intersectSet;

  SerializationVersion = 2;

  module.exports = MarkerStore = (function() {
    MarkerStore.deserialize = function(delegate, state) {
      var store;
      store = new MarkerStore(delegate);
      store.deserialize(state);
      return store;
    };

    MarkerStore.serializeSnapshot = function(snapshot) {
      var id, markerSnapshot, result;
      result = {};
      for (id in snapshot) {
        markerSnapshot = snapshot[id];
        result[id] = clone(markerSnapshot);
        result[id].range = markerSnapshot.range.serialize();
      }
      return result;
    };

    MarkerStore.deserializeSnapshot = function(snapshot) {
      var id, markerSnapshot, result;
      result = {};
      for (id in snapshot) {
        markerSnapshot = snapshot[id];
        result[id] = clone(markerSnapshot);
        result[id].range = Range.deserialize(markerSnapshot.range);
      }
      return result;
    };

    function MarkerStore(delegate) {
      this.delegate = delegate;
      this.index = new MarkerIndex;
      this.markersById = {};
      this.historiedMarkers = new Set;
      this.nextMarkerId = 0;
    }


    /*
    Section: TextBuffer API
     */

    MarkerStore.prototype.getMarker = function(id) {
      return this.markersById[id];
    };

    MarkerStore.prototype.getMarkers = function() {
      var id, marker, _ref, _results;
      _ref = this.markersById;
      _results = [];
      for (id in _ref) {
        marker = _ref[id];
        _results.push(marker);
      }
      return _results;
    };

    MarkerStore.prototype.getMarkerCount = function() {
      return Object.keys(this.markersById).length;
    };

    MarkerStore.prototype.findMarkers = function(params) {
      var end, key, markerIds, result, start, value, _i, _len, _ref, _ref1, _ref2, _ref3;
      markerIds = null;
      _ref = Object.keys(params);
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        key = _ref[_i];
        value = params[key];
        switch (key) {
          case 'startPosition':
            markerIds = filterSet(markerIds, this.index.findStartingIn(Point.fromObject(value)));
            break;
          case 'endPosition':
            markerIds = filterSet(markerIds, this.index.findEndingIn(Point.fromObject(value)));
            break;
          case 'containsPoint':
          case 'containsPosition':
            markerIds = filterSet(markerIds, this.index.findContaining(Point.fromObject(value)));
            break;
          case 'containsRange':
            _ref1 = Range.fromObject(value), start = _ref1.start, end = _ref1.end;
            markerIds = filterSet(markerIds, this.index.findContaining(start, end));
            break;
          case 'intersectsRange':
            _ref2 = Range.fromObject(value), start = _ref2.start, end = _ref2.end;
            markerIds = filterSet(markerIds, this.index.findIntersecting(start, end));
            break;
          case 'startRow':
            markerIds = filterSet(markerIds, this.index.findStartingIn(Point(value, 0), Point(value, Infinity)));
            break;
          case 'endRow':
            markerIds = filterSet(markerIds, this.index.findEndingIn(Point(value, 0), Point(value, Infinity)));
            break;
          case 'intersectsRow':
            markerIds = filterSet(markerIds, this.index.findIntersecting(Point(value, 0), Point(value, Infinity)));
            break;
          case 'intersectsRowRange':
            markerIds = filterSet(markerIds, this.index.findIntersecting(Point(value[0], 0), Point(value[1], Infinity)));
            break;
          case 'containedInRange':
            _ref3 = Range.fromObject(value), start = _ref3.start, end = _ref3.end;
            markerIds = filterSet(markerIds, this.index.findContainedIn(start, end));
            break;
          default:
            continue;
        }
        delete params[key];
      }
      if (markerIds == null) {
        markerIds = new Set(Object.keys(this.markersById));
      }
      result = [];
      markerIds.forEach((function(_this) {
        return function(id) {
          var marker;
          marker = _this.markersById[id];
          if (marker.matchesParams(params)) {
            return result.push(marker);
          }
        };
      })(this));
      return result.sort(function(a, b) {
        return a.compare(b);
      });
    };

    MarkerStore.prototype.markRange = function(range, options) {
      if (options == null) {
        options = {};
      }
      return this.createMarker(Range.fromObject(range), Marker.extractParams(options));
    };

    MarkerStore.prototype.markPosition = function(position, options) {
      if (options == null) {
        options = {};
      }
      if (options.tailed == null) {
        options.tailed = false;
      }
      return this.markRange(Range(position, position), options);
    };

    MarkerStore.prototype.splice = function(start, oldExtent, newExtent) {
      var end, endingAt, endingIn, id, intersecting, invalid, marker, startingAt, startingIn, _i, _len, _ref;
      end = start.traverse(oldExtent);
      intersecting = this.index.findIntersecting(start, end);
      endingAt = this.index.findEndingIn(start);
      startingAt = this.index.findStartingIn(end);
      startingIn = this.index.findStartingIn(start.traverse(Point(0, 1)), end.traverse(Point(0, -1)));
      endingIn = this.index.findEndingIn(start.traverse(Point(0, 1)), end.traverse(Point(0, -1)));
      _ref = Object.keys(this.markersById);
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        id = _ref[_i];
        marker = this.markersById[id];
        switch (marker.getInvalidationStrategy()) {
          case 'touch':
            invalid = intersecting.has(id);
            break;
          case 'inside':
            invalid = intersecting.has(id) && !(startingAt.has(id) || endingAt.has(id));
            break;
          case 'overlap':
            invalid = startingIn.has(id) || endingIn.has(id);
            break;
          case 'surround':
            invalid = startingIn.has(id) && endingIn.has(id);
            break;
          case 'never':
            invalid = false;
        }
        if (invalid) {
          marker.valid = false;
        }
      }
      return this.index.splice(start, oldExtent, newExtent);
    };

    MarkerStore.prototype.restoreFromSnapshot = function(snapshots) {
      var createdIds, existingMarkerIds, id, marker, newMarker, snapshot, snapshotIds, _i, _j, _len, _len1;
      if (snapshots == null) {
        return;
      }
      createdIds = new Set;
      snapshotIds = Object.keys(snapshots);
      existingMarkerIds = Object.keys(this.markersById);
      for (_i = 0, _len = snapshotIds.length; _i < _len; _i++) {
        id = snapshotIds[_i];
        snapshot = snapshots[id];
        if (marker = this.markersById[id]) {
          marker.update(marker.getRange(), snapshot, true);
        } else {
          newMarker = this.createMarker(snapshot.range, snapshot);
          createdIds.add(newMarker.id);
        }
      }
      for (_j = 0, _len1 = existingMarkerIds.length; _j < _len1; _j++) {
        id = existingMarkerIds[_j];
        if ((marker = this.markersById[id]) && (snapshots[id] == null)) {
          if (this.historiedMarkers.has(id)) {
            marker.destroy();
          } else {
            marker.emitChangeEvent(marker.getRange(), true, false);
          }
        }
      }
      this.delegate.markersUpdated();
    };

    MarkerStore.prototype.createSnapshot = function(emitChangeEvents) {
      var id, marker, ranges, result, _i, _len, _ref;
      if (emitChangeEvents == null) {
        emitChangeEvents = false;
      }
      result = {};
      ranges = this.index.dump(this.historiedMarkers);
      _ref = Object.keys(this.markersById);
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        id = _ref[_i];
        if (marker = this.markersById[id]) {
          if (marker.maintainHistory) {
            result[id] = marker.getSnapshot(ranges[id], false);
          }
          if (emitChangeEvents) {
            marker.emitChangeEvent(ranges[id], true, false);
          }
        }
      }
      if (emitChangeEvents) {
        this.delegate.markersUpdated();
      }
      return result;
    };

    MarkerStore.prototype.serialize = function() {
      var id, marker, markersById, ranges, _i, _len, _ref;
      ranges = this.index.dump();
      markersById = {};
      _ref = Object.keys(this.markersById);
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        id = _ref[_i];
        marker = this.markersById[id];
        if (marker.persistent) {
          markersById[id] = marker.getSnapshot(ranges[id], false);
        }
      }
      return {
        nextMarkerId: this.nextMarkerId,
        markersById: markersById,
        version: SerializationVersion
      };
    };

    MarkerStore.prototype.deserialize = function(state) {
      var id, markerState, range, _ref;
      if (state.version !== SerializationVersion) {
        return;
      }
      this.nextMarkerId = state.nextMarkerId;
      _ref = state.markersById;
      for (id in _ref) {
        markerState = _ref[id];
        range = Range.fromObject(markerState.range);
        delete markerState.range;
        this.addMarker(id, range, markerState);
      }
    };


    /*
    Section: Marker interface
     */

    MarkerStore.prototype.markerUpdated = function() {
      return this.delegate.markersUpdated();
    };

    MarkerStore.prototype.destroyMarker = function(id) {
      delete this.markersById[id];
      this.historiedMarkers["delete"](id);
      this.index["delete"](id);
      return this.delegate.markersUpdated();
    };

    MarkerStore.prototype.getMarkerRange = function(id) {
      return this.index.getRange(id);
    };

    MarkerStore.prototype.getMarkerStartPosition = function(id) {
      return this.index.getStart(id);
    };

    MarkerStore.prototype.getMarkerEndPosition = function(id) {
      return this.index.getEnd(id);
    };

    MarkerStore.prototype.setMarkerRange = function(id, range) {
      var end, start, _ref;
      _ref = Range.fromObject(range), start = _ref.start, end = _ref.end;
      start = this.delegate.clipPosition(start);
      end = this.delegate.clipPosition(end);
      this.index["delete"](id);
      return this.index.insert(id, start, end);
    };

    MarkerStore.prototype.setMarkerHasTail = function(id, hasTail) {
      return this.index.setExclusive(id, !hasTail);
    };

    MarkerStore.prototype.createMarker = function(range, params) {
      var id, marker;
      id = String(this.nextMarkerId++);
      marker = this.addMarker(id, range, params);
      this.delegate.markerCreated(marker);
      this.delegate.markersUpdated();
      return marker;
    };


    /*
    Section: Private
     */

    MarkerStore.prototype.addMarker = function(id, range, params) {
      var marker;
      Point.assertValid(range.start);
      Point.assertValid(range.end);
      marker = new Marker(id, this, range, params);
      this.markersById[id] = marker;
      this.index.insert(id, range.start, range.end);
      if (marker.getInvalidationStrategy() === 'inside') {
        this.index.setExclusive(id, true);
      }
      if (marker.maintainHistory) {
        this.historiedMarkers.add(id);
      }
      return marker;
    };

    return MarkerStore;

  })();

  filterSet = function(set1, set2) {
    if (set1) {
      intersectSet(set1, set2);
      return set1;
    } else {
      return set2;
    }
  };

}).call(this);
