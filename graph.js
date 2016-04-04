'use strict';

var d3 = require('d3');
var $ = require('jquery');
var _ = require('underscore');

var bufferFractionMinY = 0.1;
var bufferFractionMaxY = 0.1;

var defaultPlotBox = {
    width: 800,
    height: 400,
    padLeft: 30,
    padBottom: 30
};

var d3TickFormatdM = d3.time.format("%d-%b");
var d3TimeFormatHM = d3.time.format("%Y-%m-%dT%H:%M");
var d3TimeFormatHMS = d3.time.format("%Y-%m-%dT%H:%M:%S");
var timeToD3HM = function (s) { return d3TimeFormatHM.parse(s); };
var timeToD3HMS = function (s) { return d3TimeFormatHMS.parse(s); };

var fobsToD3Format = function (xs) {
    return _.map(xs, function (d) { return { x: timeToD3HM(d.ox), y: +d.oy }; });
}

var mkLinePath = function (width, height, minX, maxX, series, linesOfFixTs, areasOfFixAs, linesOfVarTs, areasOfVarAs) {
    var dy = function (d) { return d.y; };
    var w = width;
    var h = height;

    var seriesData = fobsToD3Format(series);
    var varLineData = _.map(linesOfVarTs, function (x) {
        var c = x.color;
        return {
            color: d3.rgb(c.red, c.green, c.blue).toString(),
            pts: fobsToD3Format(x.sm1)
        };
    });

    var fixLineData = _.map(linesOfFixTs, function (x) {
        var c = x.color;
        return {
            color: d3.rgb(c.red, c.green, c.blue).toString(),
            pts: [ {x: minX, y: x.limit}, {x: maxX, y: x.limit}]
        };
    });

    var extents = d3.extent(seriesData, dy);
    var minSeries = extents[0];
    var maxSeries = extents[1];

    var minFix = d3.min(_.map(fixLineData, function (x) {
        return d3.min(x.pts, dy);
    }));

    var maxFix = d3.max(_.map(fixLineData, function (x) {
        return d3.max(x.pts, dy);
    }));

    var minVar = d3.min(_.map(varLineData, function (x) {
        return d3.min(x.pts, dy);
    }));

    var maxVar = d3.max(_.map(varLineData, function (x) {
        return d3.max(x.pts, dy);
    }));

    var minY = d3.min([minFix, minVar, minSeries]);
    var maxY = d3.max([maxFix, maxVar, maxSeries]);

    // NOTE: Allow for some height above the maximum.
    var rangeY = (maxY - minY);

    // NOTE: We're used to seeing zero coincident with the x-axis line so let's
    // keep that going if y-min is zero. I need to buffer thresholds though so
    // that any alert bands will be visible below those lines.
    var bufferMinY = rangeY * bufferFractionMinY;
    var minFixBuffered = minFix - bufferMinY;
    var minVarBuffered = minVar - bufferMinY;
    minY = d3.min([minFixBuffered, minVarBuffered, minY]);

    var bufferMaxY = rangeY * bufferFractionMaxY;
    var maxFixBuffered = maxFix + bufferMaxY;
    var maxVarBuffered = maxVar + bufferMaxY;
    maxY = d3.max([maxFixBuffered, maxVarBuffered, maxY]);

    // NOTE: Avoid a domain such as [0, 0].
    if (minY === maxY) {
        maxY = minY + 1.0;
    }

    var domainY = [minY, maxY];
    var domainX = d3.extent([minX, maxX]);

    var fixAreaData = _.map(areasOfFixAs, function (x) {
        if (x === null) {
            return {
                color: "#000",
                pts: []
            };
        }

        // NOTE: For the domain item 0 < item 1 but for the thresholds item 0 > item 1.
        var c = x.color;
        var y0 = x.y0 || domainY[1]; 
        var y1 = x.y1 || domainY[0]; 
        return {
            color: d3.rgb(c.red, c.green, c.blue).toString(),
            pts: [ {x: minX, y0: y0, y1: y1}, {x: maxX, y0: y0, y1: y1}]
        };
    });

    var varAreaData = _.map(areasOfVarAs, function (x) {
        if (x === null) {
            return {
                color: "#000",
                pts: []
            };
        }

        // NOTE: For the domain item 0 < item 1 but for the thresholds item 0 > item 1.
        var c = x.color;
        var hex = d3.rgb(c.red, c.green, c.blue).toString();
        if (x.y0 === null && x.y1 !== null) {
            var topY = domainY[1];
            var bottoms = fobsToD3Format(x.y1);
            return {
                color: hex,
                pts: _.map(bottoms, function(d) {
                    return {x: d.x, y0: topY, y1: d.y};
                })
            };
        }

        if (x.y0 !== null && x.y1 === null) {
            var tops = fobsToD3Format(x.y0);
            var bottomY = domainY[0];
            return {
                color: hex,
                pts: _.map(tops, function(d) {
                    return {x: d.x, y0: d.y, y1: bottomY};
                })
            };
        }

        return {
            color: hex,
            pts: []
        };
    });

    var rangeX = [0, w];
    var rangeY = [h, 0];

    var scaleX = d3.time.scale()
        .domain(domainX)
        .range(rangeX);

    var scaleY = d3.scale.linear()
        .domain(domainY)
        .range(rangeY);

    var fixLine = d3.svg.line()
        .x(function (d) { return scaleX(d.x); })
        .y(function (d) { return scaleY(d.y); })

    var fixArea = d3.svg.area()
        .x(function (d) { return scaleX(d.x); })
        .y0(function (d) { return scaleY(d.y0); })
        .y1(function (d) { return scaleY(d.y1); })

    var varArea = d3.svg.area()
        .x(function (d) { return scaleX(d.x); })
        .y0(function (d) { return scaleY(d.y0); })
        .y1(function (d) { return scaleY(d.y1); })

    var seriesLine = d3.svg.line()
        .x(function (d) { return scaleX(d.x); })
        .y(function (d) { return scaleY(d.y); })
        .interpolate('step-after');

    var xAxisBottom = d3.svg.axis()
        .scale(scaleX)
        // "The specified count is only a hint; the scale may return more or fewer values depending on the input domain."
        // SOURCE: https://github.com/mbostock/d3/wiki/Time-Scales
        .ticks(6)
        .orient("bottom");

    var xAxisTop = d3.svg.axis()
        .scale(scaleX)
        .ticks(0)
        .orient("top");

    var yAxisLeft = d3.svg.axis()
        .scale(scaleY)
        .orient("left")
        .tickFormat(d3.format("s"));

    var yAxisRight = d3.svg.axis()
        .scale(scaleY)
        .ticks(0)
        .orient("right")

    return {
        seriesData: seriesData,
        fixLineData: fixLineData,
        varLineData: varLineData,
        fixAreaData: fixAreaData,
        varAreaData: varAreaData,
        seriesLine: seriesLine,
        fixLine: fixLine,
        varLine: seriesLine,
        fixArea: fixArea,
        varArea: varArea,
        xAxisBottom: xAxisBottom,
        xAxisTop: xAxisTop,
        yAxisLeft: yAxisLeft,
        yAxisRight: yAxisRight
    };
};

var plotLine = function (onPlotBox, tabPlot) {
    if (tabPlot.tab !== "SeriesAsPlot" || tabPlot.plot === null) {
        return;
    }

    var x = tabPlot.plot;
    var el = $("#chart-0");
    var w = el.parent().width();
    var h = Math.floor(w * 0.5);
    var padVert = 30;
    var paddedHeight = h + (4 * padVert);
    var paddedWidth = w;

    var plotBox = {
        width: Math.floor(w || defaultPlotBox.width),
        height: Math.floor(h || defaultPlotBox.height),
        padLeft: 60,
        padBottom: padVert
    };

    onPlotBox([plotBox.width, plotBox.height, plotBox.padLeft, plotBox.padBottom]);

    d3.selectAll('.TODO-DELETE').remove();

    var dp = mkLinePath(
            plotBox.width,
            plotBox.height,
            x.minX,
            x.maxX,
            x.series,
            x.linesOfFixTs,
            x.areasOfFixAs,
            x.linesOfVarTs,
            x.areasOfVarAs);

    _.map(x.ids, function (id) {
        var svgId = 'svg#chart-' + id.toString();
        var svg = d3.select(svgId);

        svg.attr('height', paddedHeight);
        svg.attr('width', paddedWidth);

        var axis = svg.selectAll('.axis');
        var axisX = axis.filter('.x');
        var axisY = axis.filter('.y');

        axisY
            .filter('.left')
            .append('g')
            .attr('class', 'TODO-DELETE')
            .call(dp.yAxisLeft);

        axisY
            .filter('.right')
            .append('g')
            .attr('class', 'TODO-DELETE')
            .call(dp.yAxisRight);

        svg.select('#y-axis-label')
            .attr('transform', 'translate(10,' + (plotBox.height / 2.0) + ') rotate(-90)')
            .attr('visibility', 'visible');

        if (x.series.length > 0) {
            svg.select('path.series.line').datum(dp.seriesData).attr('d', dp.seriesLine);

            axisX
                .filter('.top')
                .append('g')
                .attr('class', 'TODO-DELETE')
                .call(dp.xAxisTop);

            axisX
                .filter('.bottom')
                .append('g')
                .attr('class', 'TODO-DELETE')
                .call(dp.xAxisBottom);
        }

        svg.selectAll('path.fixt.area').data(dp.fixAreaData)
            .attr('fill', function(d) {
                return d.color;
            })
            .attr('d', function(d) {
                return dp.fixArea(d.pts);
            });

        svg.selectAll('path.fixt.line').data(dp.fixLineData)
            .attr('stroke', function(d) {
                return d.color;
            })
            .attr('d', function(d) {
                return dp.fixLine(d.pts);
            });

        svg.selectAll('path.vart.area').data(dp.varAreaData)
            .attr('fill', function(d) {
                return d.color;
            })
            .attr('d', function(d) {
                return dp.varArea(d.pts);
            });

        svg.selectAll('path.vart.line').data(dp.varLineData)
            .attr('stroke', function(d) {
                return d.color;
            })
            .attr('d', function(d) {
                return dp.varLine(d.pts);
            });
    });
};

var rgb = function (onRgbToHex, x) {
    if (x === null) {
        return;
    }

    var c = x.rgbColor;
    var rgb = d3.rgb(c.red, c.green, c.blue);
    var hexColor = rgb.toString();
    var altColor = rgb.hsl().brighter(1.4).toString();

    // NOTE: Avoid brightening to white.
    if (altColor == "#ffffff") {
        var hc = rgb.hsl();
        var hue = hc.h + 180 % 360;
        altColor = d3.hsl(hue, hc.s, hc.l).toString();
    }

    onRgbToHex({
        intColor: x.intColor,
        hexColor: hexColor,
        altColor: altColor
    });
};

exports.defaultPlotBox = defaultPlotBox;
exports.plotLine = plotLine;
exports.rgb = rgb;
