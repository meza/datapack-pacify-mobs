---
name: Updating for newer Minecraft versions
description: MUST use when updating this datapack for newer minecraft versions.
---

Prerequisite: You must understand what [Minecraft Datapacks](https://minecraft.wiki/w/Data_pack) are.

1. fetch `https://raw.githubusercontent.com/meza/Stonecraft/refs/heads/main/src/main/resources/pack_versions.json` to a temporary location.
2. identify which datapack version the current source is for in the `src/pack.mcmeta` file. The version is in the `max_format` field.
3. Look up the Java changelogs since that version at `https://feedback.minecraft.net/hc/en-us/sections/360001186971-Release-Changelogs` - you must inspect every single changelog since the last version to identify all the changes that affect datapack authors. Pay special attention to the "Data Packs" section in each changelog.
4. For each change that affects datapack authors, identify which files in the `src` folder are affected by that change. 
5. For each affected file, identify what changes need to be made to make it compatible with the new minecraft version. 
6. Make the necessary changes to the affected files to make them compatible with the new minecraft version.
7. Update the `max_format` and `min_format` fields in the `src/pack.mcmeta` file to the new version. - only update the min_format if it's necessary, otherwise keep it as is to maintain compatibility with older versions of minecraft.
8. Tell the user to test the datapack in a local minecraft instance before pushing the changes to the repository. This is important because some changes might require additional adjustments that are not covered in the changelogs, and testing will help identify those issues before they affect the server.


## WARNING

- you won't be able to test this datapack in a server instance. Mobs require players. Don't even try.
