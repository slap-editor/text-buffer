(function() {
  var BRANCHING_THRESHOLD, ChangeIterator, Leaf, Node, Patch, Point, RegionIterator, isEmpty, last,
    __slice = [].slice;

  Point = require("./point");

  last = function(array) {
    return array[array.length - 1];
  };

  isEmpty = function(node) {
    return node.inputExtent.isZero() && node.outputExtent.isZero();
  };

  BRANCHING_THRESHOLD = 3;

  Node = (function() {
    function Node(children) {
      this.children = children;
      this.calculateExtent();
    }

    Node.prototype.splice = function(childIndex, splitChildren) {
      var inputOffset, leftMergeIndex, outputOffset, rightMergeIndex, rightNeighbor, spliceChild, splitIndex, splitNodes, _ref, _ref1;
      spliceChild = this.children[childIndex];
      leftMergeIndex = rightMergeIndex = childIndex;
      if (splitChildren != null) {
        (_ref = this.children).splice.apply(_ref, [childIndex, 1].concat(__slice.call(splitChildren)));
        childIndex += splitChildren.indexOf(spliceChild);
        rightMergeIndex += splitChildren.length - 1;
      }
      if (rightNeighbor = this.children[rightMergeIndex + 1]) {
        this.children[rightMergeIndex].merge(rightNeighbor);
        if (isEmpty(rightNeighbor)) {
          this.children.splice(rightMergeIndex + 1, 1);
        }
      }
      splitIndex = Math.ceil(this.children.length / BRANCHING_THRESHOLD);
      if (splitIndex > 1) {
        if (childIndex < splitIndex) {
          splitNodes = [this, new Node(this.children.splice(splitIndex))];
        } else {
          splitNodes = [new Node(this.children.splice(0, splitIndex)), this];
          childIndex -= splitIndex;
        }
      }
      _ref1 = this.calculateExtent(childIndex), inputOffset = _ref1.inputOffset, outputOffset = _ref1.outputOffset;
      return {
        splitNodes: splitNodes,
        inputOffset: inputOffset,
        outputOffset: outputOffset,
        childIndex: childIndex
      };
    };

    Node.prototype.merge = function(rightNeighbor) {
      var childMerge, result, _ref, _ref1;
      childMerge = (_ref = last(this.children)) != null ? _ref.merge(rightNeighbor.children[0]) : void 0;
      if (isEmpty(rightNeighbor.children[0])) {
        rightNeighbor.children.shift();
      }
      if (this.children.length + rightNeighbor.children.length <= BRANCHING_THRESHOLD) {
        this.inputExtent = this.inputExtent.traverse(rightNeighbor.inputExtent);
        this.outputExtent = this.outputExtent.traverse(rightNeighbor.outputExtent);
        (_ref1 = this.children).push.apply(_ref1, rightNeighbor.children);
        result = {
          inputExtent: rightNeighbor.inputExtent,
          outputExtent: rightNeighbor.outputExtent
        };
        rightNeighbor.inputExtent = rightNeighbor.outputExtent = Point.ZERO;
        return result;
      } else if (childMerge != null) {
        this.inputExtent = this.inputExtent.traverse(childMerge.inputExtent);
        this.outputExtent = this.outputExtent.traverse(childMerge.outputExtent);
        rightNeighbor.inputExtent = rightNeighbor.inputExtent.traversalFrom(childMerge.inputExtent);
        rightNeighbor.outputExtent = rightNeighbor.outputExtent.traversalFrom(childMerge.outputExtent);
        return childMerge;
      }
    };

    Node.prototype.calculateExtent = function(childIndex) {
      var child, i, result, _i, _len, _ref;
      result = {
        inputOffset: null,
        outputOffset: null
      };
      this.inputExtent = Point.ZERO;
      this.outputExtent = Point.ZERO;
      _ref = this.children;
      for (i = _i = 0, _len = _ref.length; _i < _len; i = ++_i) {
        child = _ref[i];
        if (i === childIndex) {
          result.inputOffset = this.inputExtent;
          result.outputOffset = this.outputExtent;
        }
        this.inputExtent = this.inputExtent.traverse(child.inputExtent);
        this.outputExtent = this.outputExtent.traverse(child.outputExtent);
      }
      return result;
    };

    Node.prototype.toString = function(indentLevel) {
      var i, indent, _i;
      if (indentLevel == null) {
        indentLevel = 0;
      }
      indent = "";
      for (i = _i = 0; _i < indentLevel; i = _i += 1) {
        indent += " ";
      }
      return "" + indent + "[Node " + this.inputExtent + " " + this.outputExtent + "]\n" + (this.children.map(function(c) {
        return c.toString(indentLevel + 2);
      }).join("\n"));
    };

    return Node;

  })();

  Leaf = (function() {
    function Leaf(inputExtent, outputExtent, content) {
      this.inputExtent = inputExtent;
      this.outputExtent = outputExtent;
      this.content = content;
    }

    Leaf.prototype.insert = function(inputOffset, outputOffset, newInputExtent, newOutputExtent, newContent) {
      var inputExtentAfterOffset, outputExtentAfterOffset, splitNodes;
      inputExtentAfterOffset = this.inputExtent.traversalFrom(inputOffset);
      outputExtentAfterOffset = this.outputExtent.traversalFrom(outputOffset);
      if (this.content != null) {
        this.inputExtent = inputOffset.traverse(newInputExtent).traverse(inputExtentAfterOffset);
        this.outputExtent = outputOffset.traverse(newOutputExtent).traverse(outputExtentAfterOffset);
        this.content = this.content.slice(0, outputOffset.column) + newContent + this.content.slice(outputOffset.column);
        inputOffset = inputOffset.traverse(newInputExtent);
        outputOffset = outputOffset.traverse(newOutputExtent);
      } else if (newInputExtent.isPositive() || newOutputExtent.isPositive()) {
        splitNodes = [];
        if (outputOffset.isPositive()) {
          splitNodes.push(new Leaf(inputOffset, outputOffset, null));
        }
        this.inputExtent = newInputExtent;
        this.outputExtent = newOutputExtent;
        this.content = newContent;
        splitNodes.push(this);
        if (outputExtentAfterOffset.isPositive()) {
          splitNodes.push(new Leaf(inputExtentAfterOffset, outputExtentAfterOffset, null));
        }
        inputOffset = this.inputExtent;
        outputOffset = this.outputExtent;
      }
      return {
        splitNodes: splitNodes,
        inputOffset: inputOffset,
        outputOffset: outputOffset
      };
    };

    Leaf.prototype.merge = function(rightNeighbor) {
      var result, _ref, _ref1;
      if (((this.content != null) === (rightNeighbor.content != null)) || isEmpty(this) || isEmpty(rightNeighbor)) {
        this.outputExtent = this.outputExtent.traverse(rightNeighbor.outputExtent);
        this.inputExtent = this.inputExtent.traverse(rightNeighbor.inputExtent);
        this.content = ((_ref = this.content) != null ? _ref : "") + ((_ref1 = rightNeighbor.content) != null ? _ref1 : "");
        if (this.content === "" && this.outputExtent.isPositive()) {
          this.content = null;
        }
        result = {
          inputExtent: rightNeighbor.inputExtent,
          outputExtent: rightNeighbor.outputExtent
        };
        rightNeighbor.inputExtent = rightNeighbor.outputExtent = Point.ZERO;
        rightNeighbor.content = null;
        return result;
      }
    };

    Leaf.prototype.toString = function(indentLevel) {
      var i, indent, _i;
      if (indentLevel == null) {
        indentLevel = 0;
      }
      indent = "";
      for (i = _i = 0; _i < indentLevel; i = _i += 1) {
        indent += " ";
      }
      if (this.content != null) {
        return "" + indent + "[Leaf " + this.inputExtent + " " + this.outputExtent + " " + (JSON.stringify(this.content)) + "]";
      } else {
        return "" + indent + "[Leaf " + this.inputExtent + " " + this.outputExtent + "]";
      }
    };

    return Leaf;

  })();

  RegionIterator = (function() {
    function RegionIterator(patch, path) {
      this.patch = patch;
      this.path = path;
      if (this.path == null) {
        this.path = [];
        this.descendToLeftmostLeaf(this.patch.rootNode);
      }
    }

    RegionIterator.prototype.next = function() {
      var entry, nextChild, parentEntry, value, _ref, _ref1;
      while ((entry = last(this.path)) && entry.inputOffset.isEqual(entry.node.inputExtent) && entry.outputOffset.isEqual(entry.node.outputExtent)) {
        this.path.pop();
        if (parentEntry = last(this.path)) {
          parentEntry.childIndex++;
          parentEntry.inputOffset = parentEntry.inputOffset.traverse(entry.inputOffset);
          parentEntry.outputOffset = parentEntry.outputOffset.traverse(entry.outputOffset);
          if (nextChild = parentEntry.node.children[parentEntry.childIndex]) {
            this.descendToLeftmostLeaf(nextChild);
            entry = last(this.path);
          }
        } else {
          this.path.push(entry);
          return {
            value: null,
            done: true
          };
        }
      }
      value = (_ref = (_ref1 = entry.node.content) != null ? _ref1.slice(entry.outputOffset.column) : void 0) != null ? _ref : null;
      entry.outputOffset = entry.node.outputExtent;
      entry.inputOffset = entry.node.inputExtent;
      return {
        value: value,
        done: false
      };
    };

    RegionIterator.prototype.seek = function(targetOutputOffset) {
      var child, childIndex, childInputEnd, childInputStart, childOutputEnd, childOutputStart, inputOffset, node, outputOffset, _i, _len, _ref;
      this.path.length = 0;
      node = this.patch.rootNode;
      while (true) {
        if (node.children != null) {
          childInputEnd = Point.ZERO;
          childOutputEnd = Point.ZERO;
          _ref = node.children;
          for (childIndex = _i = 0, _len = _ref.length; _i < _len; childIndex = ++_i) {
            child = _ref[childIndex];
            childInputStart = childInputEnd;
            childOutputStart = childOutputEnd;
            childInputEnd = childInputStart.traverse(child.inputExtent);
            childOutputEnd = childOutputStart.traverse(child.outputExtent);
            if (childOutputEnd.compare(targetOutputOffset) >= 0) {
              inputOffset = childInputStart;
              outputOffset = childOutputStart;
              this.path.push({
                node: node,
                childIndex: childIndex,
                inputOffset: inputOffset,
                outputOffset: outputOffset
              });
              targetOutputOffset = targetOutputOffset.traversalFrom(childOutputStart);
              node = child;
              break;
            }
          }
        } else {
          if (targetOutputOffset.isEqual(node.outputExtent)) {
            inputOffset = node.inputExtent;
          } else {
            inputOffset = Point.min(node.inputExtent, targetOutputOffset);
          }
          outputOffset = targetOutputOffset;
          childIndex = null;
          this.path.push({
            node: node,
            inputOffset: inputOffset,
            outputOffset: outputOffset,
            childIndex: childIndex
          });
          break;
        }
      }
      return this;
    };

    RegionIterator.prototype.seekToInputPosition = function(targetInputOffset) {
      var child, childIndex, childInputEnd, childInputStart, childOutputEnd, childOutputStart, inputOffset, node, outputOffset, _i, _len, _ref;
      this.path.length = 0;
      node = this.patch.rootNode;
      while (true) {
        if (node.children != null) {
          childInputEnd = Point.ZERO;
          childOutputEnd = Point.ZERO;
          _ref = node.children;
          for (childIndex = _i = 0, _len = _ref.length; _i < _len; childIndex = ++_i) {
            child = _ref[childIndex];
            childInputStart = childInputEnd;
            childOutputStart = childOutputEnd;
            childInputEnd = childInputStart.traverse(child.inputExtent);
            childOutputEnd = childOutputStart.traverse(child.outputExtent);
            if (childInputEnd.compare(targetInputOffset) >= 0) {
              inputOffset = childInputStart;
              outputOffset = childOutputStart;
              this.path.push({
                node: node,
                childIndex: childIndex,
                inputOffset: inputOffset,
                outputOffset: outputOffset
              });
              targetInputOffset = targetInputOffset.traversalFrom(childInputStart);
              node = child;
              break;
            }
          }
        } else {
          inputOffset = targetInputOffset;
          if (targetInputOffset.isEqual(node.inputExtent)) {
            outputOffset = node.outputExtent;
          } else {
            outputOffset = Point.min(node.outputExtent, targetInputOffset);
          }
          childIndex = null;
          this.path.push({
            node: node,
            inputOffset: inputOffset,
            outputOffset: outputOffset,
            childIndex: childIndex
          });
          break;
        }
      }
      return this;
    };

    RegionIterator.prototype.splice = function(oldOutputExtent, newExtent, newContent) {
      var inputExtent, rightEdge;
      rightEdge = this.copy().seek(this.getOutputPosition().traverse(oldOutputExtent));
      inputExtent = rightEdge.getInputPosition().traversalFrom(this.getInputPosition());
      this.deleteUntil(rightEdge);
      return this.insert(inputExtent, newExtent, newContent);
    };

    RegionIterator.prototype.getOutputPosition = function() {
      var entry, result, _i, _len, _ref;
      result = Point.ZERO;
      _ref = this.path;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        entry = _ref[_i];
        result = result.traverse(entry.outputOffset);
      }
      return result;
    };

    RegionIterator.prototype.getInputPosition = function() {
      var inputOffset, node, outputOffset, result, _i, _len, _ref, _ref1;
      result = Point.ZERO;
      _ref = this.path;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        _ref1 = _ref[_i], node = _ref1.node, inputOffset = _ref1.inputOffset, outputOffset = _ref1.outputOffset;
        result = result.traverse(inputOffset);
      }
      return result;
    };

    RegionIterator.prototype.copy = function() {
      return new RegionIterator(this.patch, this.path.slice());
    };

    RegionIterator.prototype.descendToLeftmostLeaf = function(node) {
      var entry, _results;
      _results = [];
      while (true) {
        entry = {
          node: node,
          outputOffset: Point.ZERO,
          inputOffset: Point.ZERO,
          childIndex: null
        };
        this.path.push(entry);
        if (node.children != null) {
          entry.childIndex = 0;
          _results.push(node = node.children[0]);
        } else {
          break;
        }
      }
      return _results;
    };

    RegionIterator.prototype.deleteUntil = function(rightIterator) {
      var childIndex, i, inputOffset, left, meetingIndex, node, outputOffset, right, spliceIndex, totalInputOffset, totalOutputOffset, _i, _j, _ref, _ref1, _ref2, _ref3;
      meetingIndex = null;
      totalInputOffset = Point.ZERO;
      totalOutputOffset = Point.ZERO;
      _ref = this.path;
      for (i = _i = _ref.length - 1; _i >= 0; i = _i += -1) {
        _ref1 = _ref[i], node = _ref1.node, inputOffset = _ref1.inputOffset, outputOffset = _ref1.outputOffset, childIndex = _ref1.childIndex;
        if (node === rightIterator.path[i].node) {
          meetingIndex = i;
          break;
        }
        if (node.content != null) {
          node.content = node.content.slice(0, outputOffset.column);
        } else if (node.children != null) {
          node.children.splice(childIndex + 1);
        }
        totalInputOffset = inputOffset.traverse(totalInputOffset);
        totalOutputOffset = outputOffset.traverse(totalOutputOffset);
        node.inputExtent = totalInputOffset;
        node.outputExtent = totalOutputOffset;
      }
      totalInputOffset = Point.ZERO;
      totalOutputOffset = Point.ZERO;
      _ref2 = rightIterator.path;
      for (i = _j = _ref2.length - 1; _j >= 0; i = _j += -1) {
        _ref3 = _ref2[i], node = _ref3.node, inputOffset = _ref3.inputOffset, outputOffset = _ref3.outputOffset, childIndex = _ref3.childIndex;
        if (i === meetingIndex) {
          break;
        }
        if (node.content != null) {
          node.content = node.content.slice(outputOffset.column);
        } else if (node.children != null) {
          if (isEmpty(node.children[childIndex])) {
            node.children.splice(childIndex, 1);
          }
          node.children.splice(0, childIndex);
        }
        totalInputOffset = inputOffset.traverse(totalInputOffset);
        totalOutputOffset = outputOffset.traverse(totalOutputOffset);
        node.inputExtent = node.inputExtent.traversalFrom(totalInputOffset);
        node.outputExtent = node.outputExtent.traversalFrom(totalOutputOffset);
      }
      left = this.path[meetingIndex];
      right = rightIterator.path[meetingIndex];
      node = left.node;
      node.outputExtent = left.outputOffset.traverse(node.outputExtent.traversalFrom(right.outputOffset));
      node.inputExtent = left.inputOffset.traverse(node.inputExtent.traversalFrom(right.inputOffset));
      if (node.content != null) {
        node.content = node.content.slice(0, left.outputOffset.column) + node.content.slice(right.outputOffset.column);
      } else if (node.children != null) {
        spliceIndex = left.childIndex + 1;
        if (isEmpty(node.children[right.childIndex])) {
          node.children.splice(right.childIndex, 1);
        }
        node.children.splice(spliceIndex, right.childIndex - spliceIndex);
      }
      return this;
    };

    RegionIterator.prototype.insert = function(newInputExtent, newOutputExtent, newContent) {
      var childIndex, entry, inputOffset, newPath, node, outputOffset, splitNodes, _i, _ref, _ref1, _ref2, _ref3, _ref4, _ref5;
      newPath = [];
      splitNodes = null;
      _ref = this.path;
      for (_i = _ref.length - 1; _i >= 0; _i += -1) {
        _ref1 = _ref[_i], node = _ref1.node, inputOffset = _ref1.inputOffset, outputOffset = _ref1.outputOffset, childIndex = _ref1.childIndex;
        if (node instanceof Leaf) {
          _ref2 = node.insert(inputOffset, outputOffset, newInputExtent, newOutputExtent, newContent), splitNodes = _ref2.splitNodes, inputOffset = _ref2.inputOffset, outputOffset = _ref2.outputOffset;
        } else {
          _ref3 = node.splice(childIndex, splitNodes), splitNodes = _ref3.splitNodes, inputOffset = _ref3.inputOffset, outputOffset = _ref3.outputOffset, childIndex = _ref3.childIndex;
        }
        newPath.unshift({
          node: node,
          inputOffset: inputOffset,
          outputOffset: outputOffset,
          childIndex: childIndex
        });
      }
      if (splitNodes != null) {
        node = this.patch.rootNode = new Node([node]);
        _ref4 = node.splice(0, splitNodes), inputOffset = _ref4.inputOffset, outputOffset = _ref4.outputOffset, childIndex = _ref4.childIndex;
        newPath.unshift({
          node: node,
          inputOffset: inputOffset,
          outputOffset: outputOffset,
          childIndex: childIndex
        });
      }
      while (((_ref5 = this.patch.rootNode.children) != null ? _ref5.length : void 0) === 1) {
        this.patch.rootNode = this.patch.rootNode.children[0];
        newPath.shift();
      }
      entry = last(newPath);
      if (entry.outputOffset.isEqual(entry.node.outputExtent)) {
        entry.inputOffset = entry.node.inputExtent;
      } else {
        entry.inputOffset = Point.min(entry.node.inputExtent, entry.outputOffset);
      }
      this.path = newPath;
      return this;
    };

    RegionIterator.prototype.toString = function() {
      var childIndex, entries, inputOffset, node, outputOffset;
      entries = (function() {
        var _i, _len, _ref, _ref1, _results;
        _ref = this.path;
        _results = [];
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          _ref1 = _ref[_i], node = _ref1.node, inputOffset = _ref1.inputOffset, outputOffset = _ref1.outputOffset, childIndex = _ref1.childIndex;
          _results.push("  {inputOffset:" + inputOffset + ", outputOffset:" + outputOffset + ", childIndex:" + childIndex + "}");
        }
        return _results;
      }).call(this);
      return "[RegionIterator\n" + (entries.join("\n")) + "]";
    };

    return RegionIterator;

  })();

  ChangeIterator = (function() {
    function ChangeIterator(patchIterator) {
      this.patchIterator = patchIterator;
      this.inputPosition = Point.ZERO;
      this.outputPosition = Point.ZERO;
    }

    ChangeIterator.prototype.next = function() {
      var content, lastInputPosition, lastOutputPosition, newExtent, next, oldExtent, position;
      while (!(next = this.patchIterator.next()).done) {
        lastInputPosition = this.inputPosition;
        lastOutputPosition = this.outputPosition;
        this.inputPosition = this.patchIterator.getInputPosition();
        this.outputPosition = this.patchIterator.getOutputPosition();
        if ((content = next.value) != null) {
          position = lastOutputPosition;
          oldExtent = this.inputPosition.traversalFrom(lastInputPosition);
          newExtent = this.outputPosition.traversalFrom(lastOutputPosition);
          return {
            done: false,
            value: {
              position: position,
              oldExtent: oldExtent,
              newExtent: newExtent,
              content: content
            }
          };
        }
      }
      return {
        done: true,
        value: null
      };
    };

    return ChangeIterator;

  })();

  module.exports = Patch = (function() {
    function Patch() {
      this.clear();
    }

    Patch.prototype.splice = function(spliceOutputStart, oldOutputExtent, newOutputExtent, content) {
      var iterator;
      iterator = this.regions();
      iterator.seek(spliceOutputStart);
      return iterator.splice(oldOutputExtent, newOutputExtent, content);
    };

    Patch.prototype.clear = function() {
      return this.rootNode = new Leaf(Point.INFINITY, Point.INFINITY, null);
    };

    Patch.prototype.regions = function() {
      return new RegionIterator(this);
    };

    Patch.prototype.changes = function() {
      return new ChangeIterator(this.regions());
    };

    Patch.prototype.toInputPosition = function(outputPosition) {
      return this.regions().seek(outputPosition).getInputPosition();
    };

    Patch.prototype.toOutputPosition = function(inputPosition) {
      return this.regions().seekToInputPosition(inputPosition).getOutputPosition();
    };

    return Patch;

  })();

}).call(this);
