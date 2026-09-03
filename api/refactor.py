import re

with open("api/main.py", "r") as f:
    lines = f.readlines()

route_pattern = re.compile(r'^@app\.(get|post|put|delete|patch)\("(/api/[^"]+)"\)')
routes = []
current_route = []
in_route = False

for line in lines:
    if route_pattern.match(line):
        in_route = True
        current_route.append(line.replace("@app.", "@router."))
    elif in_route:
        if line.startswith("@app."): # start of next route
            routes.append(current_route)
            current_route = [line.replace("@app.", "@router.")]
        elif line.startswith("@") or line.startswith("def ") or line.startswith("async def ") or line.startswith("    ") or line.startswith(" ") or line.startswith("\t") or line.startswith("#") or line == "\n":
            current_route.append(line)
        else:
            if current_route:
                routes.append(current_route)
            current_route = []
            in_route = False
    else:
        pass

if current_route:
    routes.append(current_route)

for r in routes:
    print(r[0].strip(), len(r))
