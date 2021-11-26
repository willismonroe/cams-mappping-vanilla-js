let map = L.map("map").setView([34, 40], 5);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

const spreadsheetId = "1PWCFGhODmAsj9pYYnBlEroAQEUYrIIAuumrjJt-xG-g";

let data = [];
let headers = [];
let siteLookup = {};
let geoJSON = {};

async function fetchData() {
  const res = await fetch(
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json`
  );
  const text = await res.text();
  return JSON.parse(text.substr(47).slice(0, -2));
}

function parseJSONTable(json) {
  const json_data = [];
  const json_headers = [];
  for (const value in json.table.rows[0].c) {
    headers.push(json.table.rows[0].c[value].v);
  }

  for (const row in json.table.rows) {
    if (row != 0) {
      const json_row = [];
      for (const col in json.table.rows[row].c) {
        json_row.push(json.table.rows[row].c[col].v);
      }
      data.push(json_row);
    }
  }
}

async function fetchLocData() {
  const res = await fetch(
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json&sheet=Sheet2`
  );
  const text = await res.text();
  return JSON.parse(text.substr(47).slice(0, -2));
}

function parseLocTable(json) {
  const json_locData = {};
  for (const row in json.table.rows) {
    siteLookup[json.table.rows[row].c[0].v] = {
      lat: json.table.rows[row].c[1].v,
      lon: json.table.rows[row].c[2].v,
    };
  }
}

function createGeoJSON() {
  geoJSON = {
    type: "FeatureCollection",
    features: [],
  };
  for (row in data) {
    if (data[row][1] != "Various") {
      geoJSON.features.push({
        geometry: {
          type: "Point",
          coordinates: [
            siteLookup[data[row][1]].lat,
            siteLookup[data[row][1]].lon,
          ],
        },
        type: "Feature",
        properties: {
          genre: data[row][2],
          subgenre: data[row][3],
        },
      });
    }
  }
}

function createPieChart(id, data, columnNumber) {
  // process data
  let dataCounts = {};
  for (row in data) {
    if (data[row][columnNumber] in dataCounts) {
      dataCounts[data[row][columnNumber]]++;
    } else {
      dataCounts[data[row][columnNumber]] = 0;
    }
  }

  // set the dimensions and margins of the graph
  const width = 400,
    height = 400,
    margin = 20;

  // The radius of the pieplot is half the width or half the height (smallest one). I subtract a bit of margin.
  const radius = Math.min(width, height) / 2 - margin;

  const selector = `#${id}`;

  // append the svg object to the div called 'my_dataviz'
  const svg = d3
    .select(selector)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .append("g")
    .attr("transform", `translate(${width / 2}, ${height / 2})`);

  // Create dummy data
  //   const dummyData = { a: 9, b: 20, c: 30, d: 8, e: 12 };

  // set the color scale
  const color = d3.scaleOrdinal().range(d3.schemeSet2);

  // Compute the position of each group on the pie:
  const pie = d3.pie().value(function (d) {
    return d[1];
  });
  const data_ready = pie(Object.entries(dataCounts));

  const arcGenerator = d3.arc().innerRadius(0).outerRadius(radius);

  // Build the pie chart: Basically, each part of the pie is a path that we build using the arc function.
  svg
    .selectAll("mySlices")
    .data(data_ready)
    .join("path")
    .attr("d", arcGenerator)
    .attr("fill", function (d) {
      return color(d.data[0]);
    })
    .attr("stroke", "black")
    .style("stroke-width", "2px")
    .style("opacity", 0.7);

  svg
    .selectAll("mySlices")
    .data(data_ready)
    .join("text")
    .text(function (d) {
      return d.data[0];
    })
    .attr("transform", function (d) {
      return `translate(${arcGenerator.centroid(d)})`;
    })
    .style("text-anchor", "middle")
    .style("font-size", 17);
}

fetchData()
  .then((json) => {
    parseJSONTable(json);

    return fetchLocData();
  })
  .then((loc_json) => {
    parseLocTable(loc_json);
    createGeoJSON();
    $("#table").DataTable({
      data: data,
    });

    createPieChart("pieChartSite", data, 1);
    createPieChart("pieChartGenre", data, 2);

    const genreMap = [...new Set(data.map((d) => d[2]))];
    console.log(genreMap);

    let metadata;
    let categoryField = "genre";
    let iconField = "subgenre";
    rmax = 30;
    markerClusters = L.markerClusterGroup({
      maxClusterRadius: 2 * rmax,
      iconCreateFunction: defineClusterIcon,
    });

    map.addLayer(markerClusters);

    metadata = data.properties;
    var markers = L.geoJson(geoJSON, {
      pointToLayer: defineFeature,
      // onEachFeature: defineFeaturePopup
    });
    markerClusters.addLayer(markers);
    map.fitBounds(markers.getBounds());
    // map.attributionControl.addAttribution(metadata.attribution);
    // renderLegend();

    function defineFeature(feature, latlng) {
      var categoryVal = feature.properties[categoryField];
      iconVal = feature.properties[iconField];
      //   let myClass = "marker category-" + categoryVal +' icon-'+iconVal;
      let myClass = "marker category-" + genreMap.indexOf(categoryVal); // +' icon-'+iconVal;

      var myIcon = L.divIcon({
        className: myClass,
        iconSize: null,
      });
      return L.marker(latlng, { icon: myIcon });
    }

    function defineClusterIcon(cluster) {
      var children = cluster.getAllChildMarkers();
      let n = children.length; //Get number of markers in cluster
      let strokeWidth = 1; //Set clusterpie stroke width
      let r =
        rmax - 2 * strokeWidth - (n < 10 ? 12 : n < 100 ? 8 : n < 1000 ? 4 : 0); //Calculate clusterpie radius...
      let iconDim = (r + strokeWidth) * 2; //...and divIcon dimensions (leaflet really want to know the size)
      // data = d3.nest() //Build a dataset for the pie chart
      //   .key(function(d) { return d.feature.properties[categoryField]; })
      //   .entries(children, d3.map),
      let data = d3.group(children, (d) => d.feature.properties[categoryField]);
      //bake some svg markup
      let html = bakeThePie({
        data: data,
        valueFunc: function (d) {
          return d.values.length;
        },
        strokeWidth: 1,
        outerRadius: r,
        innerRadius: r - 10,
        pieClass: "cluster-pie",
        pieLabel: n,
        pieLabelClass: "marker-cluster-pie-label",
        pathClassFunc: function (d) {
          return "category-" + d.data.key;
        },
        pathTitleFunc: function (d) {
          console.log(metadata);
          return (
            metadata.fields[categoryField].lookup[d.data.key] +
            " (" +
            d.data.values.length +
            " accident" +
            (d.data.values.length != 1 ? "s" : "") +
            ")"
          );
        },
        // pathTitleFunc: function (d) {
        //   return "";
        // },
      });
      //Create a new divIcon and assign the svg markup to the html property
      let myIcon = new L.DivIcon({
        html: html,
        className: "marker-cluster",
        iconSize: new L.Point(iconDim, iconDim),
      });
      return myIcon;
    }

    function bakeThePie(options) {
      /*data and valueFunc are required*/
      if (!options.data || !options.valueFunc) {
        return "";
      }
      var data = options.data;
      let valueFunc = options.valueFunc;
      let r = options.outerRadius ? options.outerRadius : 28; //Default outer radius = 28px
      let rInner = options.innerRadius ? options.innerRadius : r - 10; //Default inner radius = r-10
      let strokeWidth = options.strokeWidth ? options.strokeWidth : 1; //Default stroke is 1
      let pathClassFunc = options.pathClassFunc
        ? options.pathClassFunc
        : function () {
            return "";
          }; //Class for each path
      let pathTitleFunc = options.pathTitleFunc
        ? options.pathTitleFunc
        : function () {
            return "";
          }; //Title for each path
      let pieClass = options.pieClass ? options.pieClass : "marker-cluster-pie"; //Class for the whole pie
      let pieLabel = options.pieLabel
        ? options.pieLabel
        : d3.sum(data, valueFunc); //Label for the whole pie
      let pieLabelClass = options.pieLabelClass
        ? options.pieLabelClass
        : "marker-cluster-pie-label"; //Class for the pie label
      let origo = r + strokeWidth; //Center coordinate
      let w = origo * 2; //width and height of the svg element
      let h = w;
      donut = d3.pie();
      arc = d3.arc().innerRadius(rInner).outerRadius(r);

      //Create an svg element
      var svg = document.createElementNS(d3.namespace("svg:text"), "svg");
      //Create the pie chart
      var vis = d3
        .select(svg)
        .data([data])
        .attr("class", pieClass)
        .attr("width", w)
        .attr("height", h);

      var arcs = vis
        .selectAll("g.arc")
        .data(donut.value(valueFunc))
        .enter()
        .append("svg:g")
        .attr("class", "arc")
        .attr("transform", "translate(" + origo + "," + origo + ")");

      arcs
        .append("svg:path")
        .attr("class", pathClassFunc)
        .attr("stroke-width", strokeWidth)
        .attr("d", arc)
        .append("svg:title")
        .text(pathTitleFunc);

      vis
        .append("text")
        .attr("x", origo)
        .attr("y", origo)
        .attr("class", pieLabelClass)
        .attr("text-anchor", "middle")
        //.attr('dominant-baseline', 'central')
        /*IE doesn't seem to support dominant-baseline, but setting dy to .3em does the trick*/
        .attr("dy", ".3em")
        .text(pieLabel);
      //Return the svg-markup rather than the actual element
      return serializeXmlNode(svg);
    }

    function serializeXmlNode(xmlNode) {
      if (typeof window.XMLSerializer != "undefined") {
        return new window.XMLSerializer().serializeToString(xmlNode);
      } else if (typeof xmlNode.xml != "undefined") {
        return xmlNode.xml;
      }
      return "";
    }
  });

function createPieChartIcon() {
  const width = 450,
    height = 450,
    margin = 40;

  const radius = Math.min(width, height) / 2 - margin;


  // https://www.d3-graph-gallery.com/graph/donut_basic.html
  const svg = d3
    .create("svg")
    .attr("width", width)
    .attr("height", height)
    .append("g")
    .attr("transform", `translate(${width / 2},${height / 2})`);

  const data = { a: 9, b: 20, c: 30, d: 8, e: 12 };

  const color = d3
    .scaleOrdinal()
    .range(["#98abc5", "#8a89a6", "#7b6888", "#6b486b", "#a05d56"]);

  const pie = d3.pie().value((d) => d[1]);

  const data_ready = pie(Object.entries(data));

  svg
    .selectAll("whatever")
    .data(data_ready)
    .join("path")
    .attr(
      "d",
      d3
        .arc()
        .innerRadius(100) // This is the size of the donut hole
        .outerRadius(radius)
    )
    .attr("fill", (d) => color(d.data[0]))
    .attr("stroke", "black")
    .style("stroke-width", "2px")
    .style("opacity", 0.7);

    // https://leafletjs.com/reference-1.7.1.html#divicon
  const myIcon = L.divIcon({classname: 'my-div-icon', html: svg})
}
