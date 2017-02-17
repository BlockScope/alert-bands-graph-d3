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

var d3TickFormatdM = d3.time.format('%d-%b');
var d3TimeFormatTHM = d3.time.format('%Y-%m-%dT%H:%M');
var d3TimeFormat_HM = d3.time.format('%Y-%m-%d %H:%M');
var d3TimeFormatTHMS = d3.time.format('%Y-%m-%dT%H:%M:%S');
var timeToD3_HM = function (s) { return d3TimeFormat_HM.parse(s); };
var timeToD3THM = function (s) { return d3TimeFormatTHM.parse(s); };
var timeToD3HMS = function (s) { return d3TimeFormatTHMS.parse(s); };
var bisectDate = d3.bisector(function(d) { return d.x; }).left;

var fobsToD3Format = function (xs) {
    return _.map(xs, function (d) { return { x: timeToD3THM(d.ox), y: +d.oy }; });
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

    // NOTE: If I don't have anything for y, then default to a [0, 0] y-domain.
    if ((_.isNumber(minY) && _.isNumber(maxY)) === false) {
        minY = 0;
        maxY = 0;
    }

    var rangeY = (maxY - minY);
    if (rangeY === 0.0) {
        switch (minY) {
            case 0.0:
                rangeY = 2.0;
                break;

            default:
                rangeY = 2.0 * minY;
        }
    }

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

    // NOTE: Avoid a domain such as [0, 0] or [15k, 15k] and avoid d3 arbitrarily
    // picking a small range around a flat line, eg. 15.125k .. 15.126k.
    if (minY === maxY) {
        var expansion = function () {
            switch (minY) {
                case 0.0:
                    return 1.0;

                default:
                    return (0.5 * rangeY);
            }
        }();

        maxY = minY + expansion;
        minY = minY - expansion;
    }

    var domainY = [minY, maxY];
    var domainX = d3.extent([minX, maxX]);

    var fixAreaData = _.map(areasOfFixAs, function (x) {
        if (x === null) {
            return {
                color: '#000',
                pts: []
            };
        }

        // NOTE: For the domain item 0 < item 1 but for the thresholds item 0 > item 1.
        var c = x.color;
        var y0 = x.y0 === null ? domainY[1] : x.y0; 
        var y1 = x.y1 === null ? domainY[0] : x.y1; 
        return {
            color: d3.rgb(c.red, c.green, c.blue).toString(),
            pts: [ {x: minX, y0: y0, y1: y1}, {x: maxX, y0: y0, y1: y1}]
        };
    });

    var varAreaData = _.map(areasOfVarAs, function (x) {
        if (x === null) {
            return {
                color: '#000',
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

    var rangeX = [0, w * 0.8];
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

    var seriesScatter = function(data) {
        data
            .append('circle')
            .attr('class', 'dot')
            .attr('r', 3.5)
            .attr('cx', function (d) {
                return scaleX(d.x);
            })
            .attr('cy', function (d) {
                return scaleY(d.y);
            })
            .attr('fill', '#00f');
    };

    var xAxisBottom = d3.svg.axis()
        .scale(scaleX)
        // 'The specified count is only a hint; the scale may return more or fewer values depending on the input domain.'
        // SOURCE: https://github.com/mbostock/d3/wiki/Time-Scales
        .ticks(6)
        .orient('bottom');

    var xAxisTop = d3.svg.axis()
        .scale(scaleX)
        .ticks(0)
        .orient('top');

    var yAxisLeft = d3.svg.axis()
        .scale(scaleY)
        .orient('left')
        .tickFormat(d3.format('s'));

    var yAxisRight = d3.svg.axis()
        .scale(scaleY)
        .orient('right')
        .tickFormat(d3.format('s'));

    return {
        scaleX: scaleX,
        scaleY: scaleY,
        seriesData: seriesData,
        fixLineData: fixLineData,
        varLineData: varLineData,
        fixAreaData: fixAreaData,
        varAreaData: varAreaData,
        seriesLine: seriesLine,
        seriesScatter: seriesScatter,
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

var drawOverlay = function (r, x, dy, day, hour, msgY, label) {
    label.append('circle')
        .attr('r', r);

    label.append('text')
        .attr('id', 'x-overlay-day')
        .attr('x', x)
        .attr('dy', dy)
        .attr('transform', 'rotate(-6, -100, -100) translate(0, 40)')
        .attr('text-anchor', 'left');

    label.append('text')
        .attr('id', 'x-overlay-hour')
        .attr('x', x)
        .attr('dy', dy)
        .attr('transform', 'rotate(-6, -100, -100) translate(0, 20)')
        .attr('text-anchor', 'left');

    label.append('text')
        .attr('id', 'y-overlay')
        .attr('x', x)
        .attr('dy', dy)
        .attr('transform', 'rotate(-6, -100, -100)')
        .attr('text-anchor', 'left');

    label.select('#x-overlay-day').text(day);
    label.select('#x-overlay-hour').text(hour);
    label.select('#y-overlay').text(msgY);
};

var drawLabel = function (r, x, dy, msg, label) {
    label.append('circle')
        .attr('r', r);

    label.append('text')
        .attr('x', x)
        .attr('dy', dy)
        .attr('transform', 'rotate(-10, -100, -100)')
        .attr('text-anchor', 'middle');

    label.select('text').text(msg);
};

var moveLabel = function (dp, dx, dy, label) {
    label.attr('transform', 'translate(' + dp.scaleX(dx) + ',' + dp.scaleY(dy) + ')');
};

// SEE: https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/Date/toLocaleDateString
var canLocaleDate = function () {
    try {
        new Date().toLocaleDateString('i');
    } catch (e) {
        return e.name === 'RangeError';
    }

    return false;
}

var canLocaleTime = function () {
    try {
        new Date().toLocaleTimeString('i');
    } catch (e) {
        return e.name === 'RangeError';
    }

    return false;
}

var dayHour = function (x) {
    let dayOptions = {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: undefined
    };

    let hourOptions = {
        hour: "2-digit",
        minute: "2-digit",
        second: undefined
    };

    let day = canLocaleDate()
        ? x.toLocaleDateString('en-NZ', dayOptions)
        : x.toDateString();

    let hour = canLocaleTime()
        ? x.toLocaleTimeString('en-NZ', hourOptions)
        : x.toTimeString();

    return {
        day: day,
        hour: hour
    };
}

var plotLine = function (onMark, onPlotBox, tabPlot) {
    if (tabPlot.tab !== 'SeriesAsPlot' || tabPlot.plot === null) {
        return;
    }

    var x = tabPlot.plot;
    var el = $('#chart-0');
    var w = el.parent().width();
    var h = Math.floor(w * 0.5);
    var padVert = 30;
    var paddedHeight = h + (4 * padVert);
    var paddedWidth = w;
    var yUnit = x.yUnit;

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

        svg.attr('width', paddedWidth);
        svg.attr('height', paddedHeight);
        var seriesLength = dp.seriesData.length;

        if (seriesLength > 0) {
            svg.on('mousemove', function () {
                d3.selectAll('.TODO-DELETE.OVERLAY').remove();
                var overlay =
                    svg
                    .selectAll('.xy.overlay')
                    .append('g')
                    .attr('class', 'TODO-DELETE OVERLAY')
                    .append('g')
                    .attr('class', 'focus');

                var t0 = dp.seriesData[0].x;
                var t1 = dp.seriesData[seriesLength - 1].x;
                var m = d3.mouse(this);
                var xRaw = m[0];
                var x = m[0] - plotBox.padLeft;
                dp.scaleX.clamp(true);
                var t = dp.scaleX.invert(x);

                if (t < t0 || t1 < t) {
                    // NOTE: Don't draw the overlay if it is outside the
                    // selected time period.
                    return;
                }

                var i = bisectDate(dp.seriesData, t, 1);
                var d0 = dp.seriesData[i - 1];
                var d1 = i === dp.seriesData.length ? d0 : dp.seriesData[i];
                var dx = t - d0.x > d1.x - t ? d1.x : d0.x;
                var dy = t - d0.x > d1.x - t ? d1.y : d0.y;

                if (overlay && overlay[0] && overlay[0][0]) {
                    let {day, hour} = dayHour(d1.x);
                    let msgY = d1.y.toString() + ' ' + yUnit;
                    drawOverlay(6, 9, '.3em', day, hour, msgY, overlay);
                    moveLabel(dp, dx, dy, overlay);
                }
            });
        }

        if (x.comments.length > 0 && seriesLength > 0) {
            var commentGroup = svg.select('g.comment.group');
            _.each(x.comments, function (c, ii) {
                var t = timeToD3_HM(c.ox);
                var t0 = dp.seriesData[0].x;
                var t1 = dp.seriesData[seriesLength - 1].x;

                if (t < t0 || t1 < t) {
                    // NOTE: Don't draw the comment if it is outside the
                    // selected time period.
                    return;
                }

                var i = bisectDate(dp.seriesData, t, 1);
                var d0 = dp.seriesData[i - 1];
                var d1 = i === dp.seriesData.length ? d0 : dp.seriesData[i];
                var dx = t - d0.x > d1.x - t ? d1.x : d0.x;
                var dy = t - d0.x > d1.x - t ? d1.y : d0.y;

                var nthSelector = 'g#comment-' + (ii + 1).toString();
                var nthComment = commentGroup.select(nthSelector);

                if (nthComment && nthComment[0] && nthComment[0][0]) {
                    var label =
                        nthComment
                        .append('g')
                        .attr('class', 'TODO-DELETE COMMENT')
                        .append('g')
                        .attr('class', 'focus');

                    if (label && label[0] && label[0][0]) {
                        drawLabel(6, 9, '.3em', c.oy, label);
                        moveLabel(dp, dx, dy, label);
                    }
                }
            });
        }

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

        svg.select('#y-axis-label')
            .attr('transform', 'translate(10,' + (plotBox.height / 2.0) + ') rotate(-90)');

        if (x.series.length > 0) {
            svg
                .select('path.series.line')
                .datum(dp.seriesData)
                .attr('d', dp.seriesLine);

            if (x.series.length === 1) {
                var scatter =
                    svg
                    .select('g.series.scatter')
                    .append('g')
                    .attr('class', 'TODO-DELETE')
                    .data(dp.seriesData);

                dp.seriesScatter(scatter);
            }

            var pendingComment = d3.select('#pending-comment');

            // NOTE: Inspiration for drag to position and marker taken from ...
            // SEE: https://bl.ocks.org/mbostock/4198499
            // SEE: https://bl.ocks.org/mbostock/3902569
            d3.selectAll('div.drag').on('mousedown', function() {
                d3.selectAll('.TODO-DELETE.DRAG.COMMENT').remove();

                var mouseUp = function() {
                    div.classed('active', false);
                    div.text('Drag to place comment');
                    w.on('mousemove', null).on('mouseup', null);
                }

                var move = function() {
                    var n = div.node();
                    var m = d3.mouse(n);
                    var xRaw = m[0];
                    var yRaw = m[1];
                    var x = m[0] - plotBox.padLeft;
                    var y = m[1] - plotBox.padBottom;
                    dp.scaleX.clamp(true);
                    var t = dp.scaleX.invert(x);
                    var i = bisectDate(dp.seriesData, t, 1);
                    var d0 = dp.seriesData[i - 1];
                    var d1 = i === dp.seriesData.length ? d0 : dp.seriesData[i];
                    var dx = t - d0.x > d1.x - t ? d1.x : d0.x;
                    var dy = t - d0.x > d1.x - t ? d1.y : d0.y;

                    return {
                        xRaw: xRaw,
                        x: x,
                        dx: dx,
                        y: y,
                        dy: dy
                    };
                };

                var focus =
                    svg
                    .select('g.comment.group')
                    .append('g')
                    .attr('class', 'TODO-DELETE DRAG COMMENT')
                    .append('g')
                    .attr('class', 'focus')
                    .style('display', 'none');

                drawLabel(8, 9, '-.3em', '<< affix here >>', focus);

                svg
                    .select('g.comment.group')
                    .append('g')
                    .attr('class', 'TODO-DELETE COMMENT')
                    .append('rect')
                    .attr('class', 'overlay')
                    .attr('width', plotBox.width)
                    .attr('height', plotBox.height)
                    .on('mouseover', function() { focus.style('display', null); })
                    .on('mouseout', function() { focus.style('display', 'none'); });

                var showDragXY = function(x, y, tag) {
                    tag.text('x = ' + x.toFixed().toString() + ', y = ' + y.toFixed().toString());
                };

                var mouseMove= function() {
                    var m = move();
                    showDragXY(m.x, m.y, div);
                    moveLabel(dp, m.dx, m.dy, focus);
                    onMark(m.dx.valueOf());
                };

                var div = d3.select(this)
                    .classed('active', true);

                var w = d3.select(window)
                    .on('mousemove', mouseMove)
                    .on('mouseup', mouseUp);

                // NOTE: Disable text dragging
                d3.event.preventDefault();
            });
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
    if (altColor == '#ffffff') {
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
