[out:json][timeout:180];
way["highway"="motorway"]["name"~"Ibadan",i](6.585,3.36,6.80,3.45)->.x;
(
  nwr(around.x:450)["name"]["amenity"~"^(place_of_worship|marketplace|fuel|bus_station|university|college|hospital|bank|school|police|townhall|cinema|clinic)$"];
  nwr(around.x:450)["name"]["shop"~"^(mall|supermarket|department_store)$"];
  nwr(around.x:450)["name"]["tourism"];
  nwr(around.x:450)["name"]["leisure"~"^(park|stadium)$"];
  nwr(around.x:450)["name"]["landuse"~"^(residential|commercial|industrial|religious)$"];
  nwr(around.x:450)["name"]["office"];
  nwr(around.x:450)["name"]["building"~"^(church|mosque|commercial|office|industrial|warehouse|university|stadium)$"];
);
out tags center;
