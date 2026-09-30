[out:json][timeout:60];
(
  way["highway"~"^(motorway|trunk|motorway_link|trunk_link|primary)$"](6.570,3.365,6.640,3.400);
  nwr["name"~"Ojota|Motor Park|Gani|Freedom Park|Ketu|Toll",i](6.570,3.365,6.640,3.400);
);
out tags center;
