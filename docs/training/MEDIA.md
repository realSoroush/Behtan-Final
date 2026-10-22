# Exercise media provenance — internal training pilot

Source: the user-supplied exercises-dataset-main.zip, from https://github.com/hasaneyldrm/exercises-dataset.

22 curated movements, 22 JPEG posters, 22 GIF tutorials. GIF is not narrated video. Only the selected assets are included; no third-party media API is needed at runtime. The combined JPEG/GIF payload is about 2.1 MB, not loaded all at once.

Each asset's source path, byte length and SHA-256 are in media-manifest.json. Original LICENSE and NOTICE are retained beside this file. The upstream explicitly separates dataset/code rights from GymVisual media rights. Internal-prototype use requested by the project owner is not treated as proof of a commercial distribution sublicense. Production redistribution rights are not verified by this patch. Assets are replaceable without changing the plan algorithm.

Review corrections:
- 3144: GIF shows a seated bench variation, despite upstream instructions describing sitting on the floor. A stable bench is now a required piece of equipment and Persian cues match the GIF.
- 2330: standing cable movement was removed from the curated release; 0818, a seated parallel-handle front pulldown, is used instead.
- 0493 explicitly requires a stable elevated platform; it is not labelled equipment-free.
- 3013 is the floor glute bridge; no bench is required.

Animation is opt-in. Collapsed cards load no GIF. Pause restores the JPEG. Switching exercises unmounts playback; hiding the page stops playback. No automatic animation is used under reduced-motion or ordinary settings. Rendering is a normal 180px image, not a 3D scene or canvas loop.

The public instructional route /?exercise=ID contains only generic movement instructions. QR destinations are fixed to https://pro.behtan.fit and contain no case ID, name, phone, or plan ID. Unknown IDs show a not-found message. QR PNGs were generated offline using qrcode 8.2; no tracking/QR service is called. If the domain changes, regenerate the QR PNGs and guideUrl together.

Snapshot preservation: never overwrite or delete media paths already referenced by saved plans. Future replacements must use a new filename/catalogue version while keeping old assets available for historical PDFs.
