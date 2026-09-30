[out:json][timeout:180];
way["highway"="motorway"]["name"~"Ibadan",i](6.585,3.36,6.80,3.45)->.x;
(
  way(around.x:420)["highway"~"^(primary|secondary|tertiary|unclassified|residential|living_street|service|track)$"]["access"!~"private|no"]["area"!="yes"];
);
out body geom qt;
