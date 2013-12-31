Point = require './point'

module.exports =
class Range
  @deserialize: (array) ->
    new this(array...)

  @fromObject: (object, copy) ->
    if Array.isArray(object)
      new this(object...)
    else if object instanceof this
      if copy then object.copy() else object
    else
      new this(object.start, object.end)

  @fromPointWithDelta: (pointA, rowDelta, columnDelta) ->
    pointA = Point.fromObject(pointA)
    pointB = new Point(pointA.row + rowDelta, pointA.column + columnDelta)
    new this(pointA, pointB)

  @fromText: (args...) ->
    if args.length > 1
      startPoint = Point.fromObject(args.shift())
    else
      startPoint = new Point(0, 0)
    text = args.shift()
    endPoint = startPoint.copy()
    lines = text.split('\n')
    if lines.length > 1
      lastIndex = lines.length - 1
      endPoint.row += lastIndex
      endPoint.column = lines[lastIndex].length
    else
      endPoint.column += lines[0].length
    new this(startPoint, endPoint)

  constructor: (pointA = new Point(0, 0), pointB = new Point(0, 0)) ->
    pointA = Point.fromObject(pointA)
    pointB = Point.fromObject(pointB)

    if pointA.isLessThanOrEqual(pointB)
      @start = pointA
      @end = pointB
    else
      @start = pointB
      @end = pointA

  serialize: ->
    [@start.serialize(), @end.serialize()]

  copy: ->
    new @constructor(@start.copy(), @end.copy())

  freeze: ->
    @start.freeze()
    @end.freeze()
    Object.freeze(this)

  isEqual: (other) ->
    return false unless other?

    if Array.isArray(other) and other.length == 2
      other = new @constructor(other...)

    other.start.isEqual(@start) and other.end.isEqual(@end)

  compare: (other) ->
    other = @constructor.fromObject(other)
    if value = @start.compare(other.start)
      value
    else
      other.end.compare(@end)

  isSingleLine: ->
    @start.row == @end.row

  coversSameRows: (other) ->
    @start.row == other.start.row && @end.row == other.end.row

  add: (point) ->
    new @constructor(@start.add(point), @end.add(point))

  translate: (startPoint, endPoint=startPoint) ->
    new @constructor(@start.translate(startPoint), @end.translate(endPoint))

  intersectsWith: (otherRange) ->
    if @start.isLessThanOrEqual(otherRange.start)
      @end.isGreaterThanOrEqual(otherRange.start)
    else
      otherRange.intersectsWith(this)

  containsRange: (otherRange, exclusive) ->
    {start, end} = @constructor.fromObject(otherRange)
    @containsPoint(start, exclusive) and @containsPoint(end, exclusive)

  containsPoint: (point, exclusive) ->
    # Deprecated: Support options hash with exclusive
    if exclusive? and typeof exclusive is 'object'
      {exclusive} = exclusive

    point = Point.fromObject(point)
    if exclusive
      point.isGreaterThan(@start) and point.isLessThan(@end)
    else
      point.isGreaterThanOrEqual(@start) and point.isLessThanOrEqual(@end)

  intersectsRow: (row) ->
    @start.row <= row <= @end.row

  union: (otherRange) ->
    start = if @start.isLessThan(otherRange.start) then @start else otherRange.start
    end = if @end.isGreaterThan(otherRange.end) then @end else otherRange.end
    new @constructor(start, end)

  isEmpty: ->
    @start.isEqual(@end)

  toDelta: ->
    rows = @end.row - @start.row
    if rows == 0
      columns = @end.column - @start.column
    else
      columns = @end.column
    new Point(rows, columns)

  getRowCount: ->
    @end.row - @start.row + 1

  getRows: ->
    [@start.row..@end.row]

  inspect: ->
    "[#{@start.inspect()} - #{@end.inspect()}]"
