/* Garbo — approach-scenes.js  ·  the approach board's starting text and placements
   ---------------------------------------------------------------------------
   The page starts from this and keeps every edit in the browser after that, so
   changing it here only shows once the page is reset (or in a fresh browser).
   Image ids are the plates in approach-plates.js and items.js. `refs` holds the
   scene's selects that aren't yet placed against a shot.
   --------------------------------------------------------------------------- */
window.APPROACH_SCENES = {
  title: "Flash fantasies",
  intro: "Four moments reimagined through wider, locked-off compositions — simpler, stiller, more psychologically charged images that reveal a deeper layer of Garbo’s emotional experience rather than repeating established ideas.",
  scenes: [
    {
      id: "s54", num: "54", kind: "Flash fantasy", title: "Sculpting",
      note: "The sculpting fantasy feels tonally different from those before and after it. Consider reimagining it through a single, locked-off, wide composition — something more simple, refined and psychologically charged than the current close-up approach.",
      set: "Isolation",
      setNote: "Broad visual references – individual images, largely wide and locked-off.",
      shots: [
        { title: "A solitary contorted figure in a sparse, undefined space",
          text: "A wide, locked-off composition of Garbo alone, her body held completely still in an unnatural, sculptural contortion.",
          imgs: ["x-fcc294e3cc", "x-41abe45cf1", "x-8f81c58396", "x-544eb5cc97", "x-655ddd919a", "x-aa6c564704", "x-ca0b829292", "x-090499e1ab", "x-4622c99877"] },
        { title: "A solitary contorted sculpture",
          text: "A single, distorted sculptural figure, motionless in a vast, non-specific space.",
          imgs: ["163", "497", "x-5615f47c57"] },
        { title: "Garbo as a living sculpture among sculptures",
          text: "A wide, locked-off composition of Garbo standing motionless among sculptural forms in a studio-like space, her body almost indistinguishable from the sculptures surrounding her.",
          imgs: ["105", "403", "004"] },
        { title: "Garbo covered in wet clay",
          text: "Slowly pushing it back from her hair as it begins to set and harden.",
          imgs: ["x-10b7bcb349", "x-21e987330c"] }
      ],
      refs: ["090", "x-0a3e4a3e4f", "x-95470bdf84", "x-7623f42785", "x-2997a8320d", "x-fdeb65d742", "x-c5bd4d81f7", "x-62aebe0204", "x-0f637116a0", "x-e9d56d529f", "x-0cf572ce48", "x-e46335432f"]
    },
    {
      id: "s71", num: "71", kind: "Flash fantasy", title: "Isolation",
      note: "The Mimi kiss may be unnecessary here. Perhaps this section could instead explore Garbo’s isolation, building on the bold, poetic visual language of the earlier fantasies through wider, more evocative compositions. Aim for simple yet powerful, surreal and psychologically charged imagery that reveals a deeper layer of her emotional experience rather than repeating established ideas.",
      set: "Isolation",
      setNote: "Broad visual references – individual images, largely wide and locked-off.",
      shots: [
        { title: "Solitary figure in a vast landscape",
          text: "A wide, locked-off image of Garbo standing completely still, almost swallowed by an immense, empty landscape. Her figure dwarfed by the scale and silence of the environment.",
          imgs: ["x-a0af814232", "x-c8890c2199", "202", "x-8a41722f2d", "015", "x-0996786351"] },
        { title: "Pulled by invisible hands",
          text: "Garbo seated, her body slowly lifted from the chair by unseen hands. The invisible force pulls her upward, with no other figures present in the frame.",
          imgs: ["090"] },
        { title: "California street / rippling reflection",
          text: "Garbo stands alone on a California street, surrounded by buildings. A seemingly ordinary, still composition until a single drop of water disturbs the image, sending ripples across the entire street and revealing that what we have been watching is a reflection.",
          imgs: [] },
        { title: "Endless tree-lined road",
          text: "Garbo, a solitary figure walking through a vast, tree-lined avenue or forest, seemingly unable to find her way out. A sustained wide frame where the landscape feels endless.",
          imgs: ["149", "302"] },
        { title: "Trapped in a marsh",
          text: "Garbo alone in a vast, waterlogged landscape, struggling to pull herself through the marsh. Her movements are slow and laboured against the stillness of the surrounding environment.",
          imgs: ["s02"] },
        { title: "Water falling in darkness",
          text: "Garbo stands alone in an otherwise dark, undefined space. A continuous column of water falls directly onto her, her figure motionless beneath it. A stark, isolated image.",
          imgs: ["x-62aebe0204"] },
        { title: "Tethered body",
          text: "Garbo held in an unnatural leaning position by a taut rope, her body suspended against its pull. A wide, static composition in which the tension of the body and the restraint create the image.",
          imgs: ["x-2997a8320d", "x-fdeb65d742", "x-7623f42785", "x-c5bd4d81f7"] },
        { title: "Submerged / weighted by clay",
          text: "Garbo underwater, a heavy mass of clay pulling her slowly towards the bottom. Her body suspended in the vastness of the water, struggling against the weight.",
          imgs: ["x-e46335432f"] },
        { title: "A wide composition built around negative space",
          text: "Garbo alone within an austere frame, where emptiness and distance carry the emotional meaning as much as the body itself.",
          imgs: ["213", "x-42b0df08b3"] }
      ],
      refs: ["332", "x-12f80f0e4a"]
    },
    {
      id: "s116", num: "116", kind: "Flash fantasy", title: "Mimi",
      note: "Consider reimagining this moment, as the layering of characters at different ages feels repetitive. Perhaps explore wider, more evocative compositions with simpler, more powerful and psychologically charged imagery — less explicit, and more emotionally resonant.",
      set: "Untethered",
      setNote: "Broad visual references – individual images, largely wide and locked-off.",
      shots: [
        { title: "Young Mimi dancing before a fire",
          text: "A wide, still image of a young Mimi dancing alone in front of a fire, the movement feeling ecstatic, primal and untethered.",
          imgs: ["x-ebc2800c36"] },
        { title: "Wind violent wind between Garbo and Mimi",
          text: "Garbo and Mimi held apart in a vast landscape, with a violent wind moving past them. A simple, wide composition where distance and atmosphere carry the emotion.",
          imgs: ["x-838a0a9768"] },
        { title: "Mimi before crashing waves",
          text: "Mimi alone in front of violent waves, small against the scale of the sea. A stark image of freedom, longing and emotional force.",
          imgs: [] },
        { title: "Young Garbo and young Mimi running across a landscape",
          text: "The two run together through an open landscape, until Garbo gradually peels away and Mimi continues running on alone. A simple, poignant image of separation.",
          imgs: ["296", "494"] },
        { title: "Garbo watching Mimi float behind her",
          text: "A wide, still image from behind Garbo’s head in an old Stockholm street, with Mimi suspended or drifting behind her, untethered yet still connected — perhaps by a rope. An oneiric image of attachment, distance and memory.",
          imgs: ["x-a642e2a4dd", "x-3366ea2082", "x-a641fd0687", "x-d861c06847"] },
        { title: "Garbo watching Mimi in the far distance",
          text: "A wide, still image from behind Garbo’s head, watching Mimi far off in a vast landscape beyond a house. A simple, haunting composition that evokes distance, longing and separation.",
          imgs: ["015", "202", "x-12f80f0e4a"] }
      ],
      refs: []
    },
    {
      id: "s119", num: "119–122", kind: "Flash fantasy", title: "Letting Go of Identity",
      note: "Consider removing the current flash fantasy — the mirror maze, explanatory V.O. and younger-self flashback. The themes of masks and identity are already beautifully woven throughout the film. Perhaps reimagine this moment through something more surreal, simple and evocative, using wider, more cinematic compositions. Imagery of fire, water, wind or physical destruction could capture the dissolution of identity in a less literal, more emotionally powerful way.",
      set: "Letting Go of Identity",
      setNote: "Broad visual references – distinct visual options, largely wide and locked-off.",
      shots: [
        { title: "A house crumbling from within",
          text: "A wide, locked-off composition inside an old house. The walls begin to crack, plaster falls from the ceiling and wind tears through the room, as though the house itself is coming apart.",
          imgs: ["x-9d2c2a313e", "x-ae624b38c1"] },
        { title: "Water ravaging an old house",
          text: "A still, wide image of an old interior as water surges through it, flooding the rooms and overwhelming the space.",
          imgs: [] },
        { title: "Hands holding flames",
          text: "A simple, sustained image of hands holding fire, flames slowly growing or moving across the palms.",
          imgs: ["x-da5c4c704a"] },
        { title: "Flames floating on water",
          text: "A vast expanse of dark water, with flames moving across the surface of the waves. A surreal, still composition where fire and water coexist.",
          imgs: ["x-0b3e8eea5b"] },
        { title: "A woman before a wall of fire",
          text: "Garbo stands motionless before an immense wall of flames, her small silhouette dwarfed by the scale of the fire.",
          imgs: ["x-1eb56db2fb", "x-f86c21b716", "x-6e5624567b", "x-942bea1a24", "x-b28fdcdac0"] },
        { title: "A sudden drop into water",
          text: "A street or familiar landscape abruptly falls away into a lake, the ordinary world giving way to water.",
          imgs: [] },
        { title: "Garbo surrounded by embers",
          text: "A wide, locked-off image of Garbo standing still in a vast landscape as glowing embers and ash fill the air around her.",
          imgs: ["x-0302efcacd", "x-627805ea1d"] },
        { title: "A house collapsing into the sea",
          text: "A solitary house, partially submerged or fallen into the ocean, with waves crashing against it and slowly pulling the structure apart.",
          imgs: ["x-cf172de292", "x-589de50be8", "x-54988c38dd"] }
      ],
      refs: ["x-e350e5987e", "x-3b475bf118"]
    }
  ]
};
