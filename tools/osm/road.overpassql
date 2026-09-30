[out:json][timeout:120];
(
  way["highway"~"^(motorway|trunk|motorway_link|trunk_link)$"](6.575,3.36,6.80,3.45);
  way["bridge"]["highway"~"footway|pedestrian|steps|path"](6.575,3.36,6.80,3.45);
  node["highway"~"bus_stop|toll_gantry|motorway_junction"](6.575,3.36,6.80,3.45);
);
out body geom;
