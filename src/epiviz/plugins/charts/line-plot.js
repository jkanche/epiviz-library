/**
 * Created by Florin Chelaru ( florinc [at] umd [dot] edu )
 * Date: 12/9/2014
 * Time: 1:09 AM
 */

goog.provide('epiviz.plugins.charts.LinePlot');

/**
 * @param {string} id
 * @param {jQuery} container
 * @param {epiviz.ui.charts.VisualizationProperties} properties
 * @extends {epiviz.ui.charts.Plot}
 * @constructor
 */
epiviz.plugins.charts.LinePlot = function(id, container, properties) {
  // Call superclass constructor
  epiviz.ui.charts.Plot.call(this, id, container, properties);

  this._initialize();
};

/*
 * Copy methods from upper class
 */
epiviz.plugins.charts.LinePlot.prototype = epiviz.utils.mapCopy(epiviz.ui.charts.Plot.prototype);
epiviz.plugins.charts.LinePlot.constructor = epiviz.plugins.charts.LinePlot;

/**
 * @protected
 */
epiviz.plugins.charts.LinePlot.prototype._initialize = function() {
  // Call super
  epiviz.ui.charts.Plot.prototype._initialize.call(this);

  this._svg.classed('line-plot', true);
};

/**
 * @param {epiviz.datatypes.GenomicRange} [range]
 * @param {?epiviz.measurements.MeasurementHashtable.<epiviz.datatypes.GenomicDataMeasurementWrapper>} [data]
 * @param {number} [slide]
 * @param {number} [zoom]
 * @returns {Array.<epiviz.ui.charts.ChartObject>} The objects drawn
 */
epiviz.plugins.charts.LinePlot.prototype.draw = function(range, data, slide, zoom) {

  var lastRange = this._lastRange;

  epiviz.ui.charts.Plot.prototype.draw.call(this, range, data, slide, zoom);

  // If data is defined, then the base class sets this._lastData to data.
  // If it isn't, then we'll use the data from the last draw call
  data = this._lastData;
  range = this._lastRange;

  if (lastRange && range && lastRange.overlapsWith(range) && lastRange.width() == range.width()) {
    slide = range.start() - lastRange.start();
  }

  // If data is not defined, there is nothing to draw
  if (!data || !range) { return []; }

  var CustomSetting = epiviz.ui.charts.CustomSetting;
  var minY = this.customSettingsValues()[epiviz.ui.charts.Visualization.CustomSettings.Y_MIN];
  var maxY = this.customSettingsValues()[epiviz.ui.charts.Visualization.CustomSettings.Y_MAX];

  if (minY == CustomSetting.DEFAULT) {
    minY = null;
    this.measurements().foreach(function(m) {
      if (m === null) { return; }
      if (minY === null || m.minValue() < minY) { minY = m.minValue(); }
    });
  }

  if (maxY == CustomSetting.DEFAULT) {
    maxY = null;
    this.measurements().foreach(function(m) {
      if (m === null) { return; }
      if (maxY === null || m.maxValue() > maxY) { maxY = m.maxValue(); }
    });
  }

  if (minY === null && maxY === null) { minY = -1; maxY = 1; }
  if (minY === null) { minY = maxY - 1; }
  if (maxY === null) { maxY = minY + 1; }

  var Axis = epiviz.ui.charts.Axis;
  var xScale = d3.scale.linear()
    .domain([0, this.measurements().size() - 1])
    .range([0, this.width() - this.margins().sumAxis(Axis.X)]);
  var yScale = d3.scale.linear()
    .domain([minY, maxY])
    .range([this.height() - this.margins().sumAxis(Axis.Y), 0]);

  this._clearAxes();
  this._drawAxes(xScale, yScale, this.measurements().size(), 5,
    undefined, undefined, undefined, undefined, undefined, undefined,
    this.measurements().toArray().map(function(m) { return m.name(); }));

  var linesGroup = this._svg.selectAll('.lines');

  if (linesGroup.empty()) {
    var graph = this._svg.append('g')
      .attr('class', 'lines items')
      .attr('transform', 'translate(' + this.margins().left() + ', ' + this.margins().top() + ')');

    var selectedGroup = graph.append('g').attr('class', 'selected');
    graph.append('g').attr('class', 'hovered');
    selectedGroup.append('g').attr('class', 'hovered');
  }
  return this._drawLines(range, data, xScale, yScale);
};

/**
 * @param {epiviz.datatypes.GenomicRange} range
 * @param {epiviz.measurements.MeasurementHashtable.<epiviz.datatypes.GenomicDataMeasurementWrapper>} data
 * @param {function} xScale D3 linear scale
 * @param {function} yScale D3 linear scale
 * @returns {Array.<epiviz.ui.charts.ChartObject>} The objects drawn
 * @private
 */
epiviz.plugins.charts.LinePlot.prototype._drawLines = function(range, data, xScale, yScale) {
  /** @type {epiviz.ui.charts.ColorPalette} */
  var colors = this.colors();

  /** @type {boolean} */
  var showPoints = this.customSettingsValues()[epiviz.plugins.charts.LinePlotType.CustomSettings.SHOW_POINTS];

  /** @type {boolean} */
  var showLines = this.customSettingsValues()[epiviz.plugins.charts.LinePlotType.CustomSettings.SHOW_LINES];

  /** @type {number} */
  var pointRadius = this.customSettingsValues()[epiviz.plugins.charts.LinePlotType.CustomSettings.POINT_RADIUS];

  /** @type {number} */
  var lineThickness = this.customSettingsValues()[epiviz.plugins.charts.LinePlotType.CustomSettings.LINE_THICKNESS];

  var interpolation = this.customSettingsValues()[epiviz.plugins.charts.LinePlotType.CustomSettings.INTERPOLATION];

  var label = this.customSettingsValues()[epiviz.ui.charts.Visualization.CustomSettings.LABEL];

  var self = this;

  var graph = this._svg.select('.lines');

  var firstGlobalIndex = data.first().value.globalStartIndex();
  var lastGlobalIndex = data.first().value.size() + firstGlobalIndex;

  data.foreach(function(measurement, series) {
    var firstIndex = series.globalStartIndex();
    var lastIndex = series.size() + firstIndex;

    if (firstIndex > firstGlobalIndex) { firstGlobalIndex = firstIndex; }
    if (lastIndex < lastGlobalIndex) { lastGlobalIndex = lastIndex; }
  });

  var nEntries = lastGlobalIndex - firstGlobalIndex;

  // TODO: This might not be needed anymore
  // TODO: Search for all usages of this method
  var dataHasGenomicLocation = epiviz.measurements.Measurement.Type.isOrdered(this.measurements().first().type());
  var firstIndex, lastIndex;
  for (var i = 0; i < nEntries; ++i) {
    var globalIndex = i + firstGlobalIndex;
    var item = data.get(this.measurements().first()).getByGlobalIndex(globalIndex).rowItem;
    if (!dataHasGenomicLocation ||
      (range.start() == undefined || range.end() == undefined) ||
      item.start() < range.end() && item.end() >= range.start()) {
      if (firstIndex == undefined) { firstIndex = globalIndex; }
      lastIndex = globalIndex + 1;
    }
  }

  firstGlobalIndex = firstIndex;
  lastGlobalIndex = lastIndex;
  nEntries = lastIndex - firstIndex;

  var width = this.width();

  var lineFunc = d3.svg.line()
    .x(function(d) {
      return xScale(d.x);
    })
    .y(function(d) {
      return yScale(d.y);
    })
    .interpolate(interpolation);

  var valuesForIndex = function(index) {
    return self.measurements().toArray().map(function(m, i) {
      return { x: i, y: data.get(m).getByGlobalIndex(index).value };
    });
  };

  var lineData = function(index) {
    return lineFunc(valuesForIndex(index));
  };

  var indices = epiviz.utils.range(nEntries, firstGlobalIndex);

  var lineItems;
  if (!showLines) {
    graph.selectAll('.line-series').remove();
  } else {
    lineItems = indices.map(function(index) {
      var rowItem = data.first().value.getByGlobalIndex(index).rowItem;
      return new epiviz.ui.charts.ChartObject(
        sprintf('line-series-%s', index),
        rowItem.start(),
        rowItem.end(),
        valuesForIndex(index),
        index,
        self.measurements().toArray().map(function(m, i) { return [data.get(m).getByGlobalIndex(index)]; }), // valueItems one for each measurement
        self.measurements().toArray(), // measurements
        '');
    });
    var lines = graph.selectAll('.line-series')
      .data(lineItems, function(d) { return d.id; });

    lines
      .enter()
      .insert('g', ':first-child').attr('class', 'line-series item')
      .style('opacity', '0')
      .on('mouseover', function(d) {
        self._hover.notify(new epiviz.ui.charts.VisEventArgs(self.id(), d));
      })
      .on('mouseout', function () {
        self._unhover.notify(new epiviz.ui.charts.VisEventArgs(self.id()));
      })
      .each(function(d) {
        d3.select(this)
          .append('path').attr('class', 'bg-line')
          //.attr('d', lineData(index))
          .attr('d', lineFunc(d.values))
          .style('shape-rendering', 'auto')
          .style('stroke-width', 10)
          .style('stroke', '#dddddd')
          .style('stroke-opacity', '0.1');
        d3.select(this)
          .append('path').attr('class', 'main-line')
          //.attr('d', lineData(index))
          .attr('d', lineFunc(d.values))
          .style('shape-rendering', 'auto');
      });

    lines
      .transition()
      .duration(500)
      .style('opacity', '0.7')
      .each(function(d) {
        d3.select(this)
          .selectAll('.bg-line')
          //.attr('d', lineData(index));
          .attr('d', lineFunc(d.values));
        d3.select(this).selectAll('.main-line')
          //.attr('d', lineData(index))
          .attr('d', lineFunc(d.values))
          .style('stroke', colors.get(d.seriesIndex))
          .style('stroke-width', lineThickness);
      });

    lines
      .exit()
      .transition()
      .duration(500)
      .style('opacity', '0')
      .remove();
  }

  if (!showPoints) {
    graph.selectAll('.points').remove();
  } else {
    var points = graph.selectAll('.points')
      .data(indices, String);

    points
      .enter()
      .append('g').attr('class', 'points')
      .each(function(index) {
        d3.select(this).selectAll('circle')
          .data(valuesForIndex(index))
          .enter()
          .append('circle')
          .attr('cx', function(d) { return xScale(d.x); })
          .attr('cy', function(d) { return yScale(d.y); })
          .attr('r', pointRadius)
          .attr('fill', 'none')
          .attr('stroke', colors.get(index));
      })
      .style('opacity', '0');

    points
      .each(function(index) {
        d3.select(this).selectAll('circle')
          .transition()
          .duration(500)
          .attr('cx', function(d) { return xScale(d.x); })
          .attr('cy', function(d) { return yScale(d.y); })
          .attr('r', pointRadius)
          .style('stroke-width', 2)
          .attr('stroke', colors.get(index));
      })
      .transition()
      .duration(500)
      .style('opacity', '1');

    points
      .exit()
      .transition()
      .duration(500)
      .style('opacity', '0');
  }

  // Draw legend
  var title = '';

  this._svg.selectAll('.chart-title').remove();
  var titleEntries = this._svg
    .selectAll('.chart-title')
    .data(indices)
    .enter()
    .append('text')
    .attr('class', 'chart-title')
    .attr('font-weight', 'bold')
    .attr('fill', function(index, i) { return colors.get(index); })
    .attr('y', self.margins().top() - 5)
    .text(function(index) { return data.first().value.getByGlobalIndex(index).rowItem.metadata(label); });

  var textLength = 0;
  var titleEntriesStartPosition = [];

  $('#' + this.id() + ' .chart-title')
    .each(function(i) {
      titleEntriesStartPosition.push(textLength);
      textLength += this.getBBox().width + 3;
    });

  titleEntries.attr('x', function(column, i) {
    return self.margins().left() + 3 + titleEntriesStartPosition[i];
  });

  return lineItems;
};

/**
 * @returns {Array.<string>}
 */
epiviz.plugins.charts.LinePlot.prototype.colorLabels = function() {
  var labels = [];
  for (var i = 0; i < this.colors().size() && i < 20; ++i) {
    labels.push('Color ' + (i + 1));
  }
  return labels;
};