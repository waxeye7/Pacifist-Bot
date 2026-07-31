import re
js = open(
    r"package\dist\renderer-metadata.js", encoding="utf-8", errors="ignore"
).read()
texs = set(re.findall(r'texture:"([^"]+)"', js))
print("textures", sorted(texs))
for name in ["spawn", "container", "source", "road"]:
    i = js.find(name + ":")
    print("\n===", name, "idx", i)
    if i > 0:
        print(js[i : i + 600])
