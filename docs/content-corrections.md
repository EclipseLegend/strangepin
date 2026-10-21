# Proposed content corrections (NOT applied in `fix/audit-critical`)

These are proposals for the owner's review. No pin text, coordinate or category
has been changed in this branch. Every source below was opened and checked on
2026-10-21; anything without a reliable source is marked **source needed**.
Pin IDs refer to `LOCATIONS[]` in `index.html`.

Legend: **Fact** = factual error · **Framing** = speculation presented as fact /
outdated · **Sensitivity** = respect for victims, human remains, living cultures ·
**Data** = coordinates, duplicates, categories.

---

## 1. Factual and framing corrections

### 012 · The Voynich Manuscript (Fact, Data)
- **Current:** country "Italy", coordinates 41.9028, 12.4964 (Rome).
- **Issue:** The manuscript has been held since 1969 at Yale University's Beinecke Rare Book & Manuscript Library (New Haven, Connecticut, USA), and Yale has published it online.
- **Proposal:** Move the pin to the Beinecke Library, New Haven, USA (take exact coordinates from a map when editing), set country "USA" and city "New Haven", and note that it is an object held in a library, not a site.
- **Sources:**
  - Beinecke Library, Voynich Manuscript: https://beinecke.library.yale.edu/collections/highlights/voynich-manuscript
  - Wikipedia, "Voynich manuscript": https://en.wikipedia.org/wiki/Voynich_manuscript

### 049 · The Skeleton Lake (Roopkund) (Framing)
- **Current:** "500-year-old skeletons of hundreds of people who died in one mysterious event."
- **Issue:** An ancient-DNA study (Harney et al., *Nature Communications*, 2019) found three distinct ancestry groups who died in at least two separate events, roughly 800 CE and 1800 CE. The "single event" story is outdated.
- **Proposal:** "Hundreds of human skeletons lie around this Himalayan lake. DNA studies show they belong to distinct groups who died centuries apart, around 800 CE and 1800 CE. How and why they died here is still debated." Add the `Tragic Event` and `Sensitive` flags (human remains).
- **Sources:**
  - Harney et al. 2019, *Nat. Commun.*: https://www.nature.com/articles/s41467-019-11357-9
  - Wikipedia, "Roopkund": https://en.wikipedia.org/wiki/Roopkund

### 079 · The Atacama Skeleton ("Ata") (Fact, Sensitivity)
- **Current:** "A 15cm mummified humanoid with 10 ribs instead of 12 and unusual DNA."
- **Issue:** A whole-genome study published in 2018 (Bhattacharya et al., *Genome Research*) concluded that the remains are of a **premature human fetus** with genetic variants affecting skeletal development. A later critique (Halcrow et al., 2018) disputed parts of the genetic interpretation but agreed the remains are human. Calling them a "humanoid" implies a non-human origin, and these are human remains whose removal from Chile has drawn ethical criticism.
- **Proposal:** "The 15 cm skeleton of a premature human fetus found in 2003 near La Noria in Chile's Atacama Desert. It was once promoted as 'alien'. Genome sequencing in 2018 confirmed it is human, and the case is now debated mainly over the ethics of handling human remains." Add the `Sensitive` flag.
- **Category:** consider "Urban Legend" (for the alien myth) or a future "Debunked / Explained" status.
- **Sources:**
  - Wikipedia, "Atacama skeleton": https://en.wikipedia.org/wiki/Atacama_skeleton
  - Bhattacharya et al. 2018, DOI 10.1101/gr.223693.117: https://doi.org/10.1101/gr.223693.117 (the publisher site rate-limited automated access during the check; the DOI resolves).

### 046 · The Sleeping City of Kalachi (Framing, Data)
- **Current:** coordinates 51.3289, 65.7139; "residents randomly fall asleep…" with no cause given.
- **Coordinates:** Wikipedia gives 52.2472, 66.5286 (52°14′50″N 66°31′43″E). The current pin is about 100 km away.
- **Cause:** In 2015 the Kazakh government attributed the "sleeping sickness" (reported 2012–2015, over 140 cases) to elevated carbon monoxide and hydrocarbons, with reduced oxygen, linked to abandoned uranium mines nearby. Residents were resettled.
- **Proposal:** correct the coordinates and city ("Kalachi, Akmola Region"). Present the event as real and affecting real people, with the official explanation in "What we know". Add the `Sensitive` flag.
- **Sources:**
  - Wikipedia, "Kalachi, Kazakhstan": https://en.wikipedia.org/wiki/Kalachi,_Kazakhstan
  - National Nuclear Center of Kazakhstan survey: https://www.nnc.kz/en/news/show/360
  - Kazinform (2015): https://qazinform.com/news/cause-of-bizarre-sleeping-illness-in-kazakh-village-revealed_a2795665

### 052 · Paracas Skulls (Framing)
- **Current:** the fringe DNA claims lead the copy. The disclaimer ("not published in peer-reviewed journals") sits after the 200-character preview cut, so it was hidden. The word-boundary fix in this branch now shows more of it.
- **Proposal:** lead with the mainstream explanation (intentional cranial deformation, a well-documented cultural practice) and keep the unpublished DNA claims clearly labelled as claims. Add the `Disputed Claim` and `Sensitive` flags (ancestral human remains).
- **Sources:**
  - Wikipedia, "Paracas skulls": https://en.wikipedia.org/wiki/Paracas_skulls
  - Wikipedia, "Artificial cranial deformation": https://en.wikipedia.org/wiki/Artificial_cranial_deformation

### 018 · Poveglia Island (Framing)
- **Current:** "an estimated 160,000 plague victims were buried and burned."
- **Issue:** According to the Italian sceptics' organisation CICAP (as summarised on Wikipedia), the haunting claims and the "over 100,000 buried in plague pits" figure came from the US TV show *Ghost Adventures* (2009). Venetian historian Alberto Toso Fei told the *New York Times* that plague deaths on the island were closer to 20.
- **Proposal:** remove the 160,000 figure. Describe Poveglia as one of several Venetian quarantine islands whose large-scale plague-pit legend is popular but disputed. Add the `Disputed Claim` flag.
- **Source:** Wikipedia, "Poveglia": https://en.wikipedia.org/wiki/Poveglia (cites CICAP and the NYT interview; check the primary citations before publishing).

### 019 · The Overtoun Bridge (Framing)
- **Current:** "over 600 dogs have leaped to their deaths."
- **Issue:** Wikipedia describes media reports since 2005 of dogs leaping from the bridge, plus a scent-based explanation. It gives no "600 deaths" figure. **Source needed** for any number.
- **Proposal:** "Since the mid-2000s, media reports have described dogs leaping from this Victorian bridge. Explanations range from the supernatural to the scent of animals (e.g. mink) below and the bridge's deceptive parapet." Add the `Disputed Claim` flag.
- **Source:** Wikipedia, "Overtoun House": https://en.wikipedia.org/wiki/Overtoun_House

### 073 · The Lake Michigan Stonehenge (Framing, Data)
- **Current:** "A circle of stones … depicting a mastodon and arranged like Stonehenge"; coordinates 44.0, −86.4 (mid-lake).
- **Issue:** The 2007 find by underwater archaeologist Mark Holley is in **Grand Traverse Bay**, at about 40 ft depth. It is mainly a long line of small stones, a few arranged in a circle, plus one boulder with possible mastodon-like markings that experts have not confirmed. Holley himself says it is "not a megalith site like Stonehenge". The exact location is kept secret.
- **Proposal:**
  - Rename to "Grand Traverse Bay Stone Line".
  - Pin the general bay area and mark it approximate.
  - Rewrite the copy along the lines above, and add the `Disputed Claim` flag.
  - Move the pin away from 051 Michigan Triangle (currently 44.0, −86.5), which overlaps it.
- **Sources:**
  - AP via NBC News (2007): https://www.nbcnews.com/id/wbna20593217
  - Mark Holley: https://holleyarchaeology.com/index.php/the-truth-about-the-stonehenge-in-lake-michigan/
  - Phys.org (2009): https://phys.org/news/2009-02-debate-unfolds-grouped-stones-lake.html

### 075 · The Winchester Catfish Lake (Fact: unverifiable)
- **Current:** "A Memphis lake where locals claim enormous catfish the size of cars lurk…"
- **Issue:** No source found for a "Winchester Catfish Lake" in Memphis. The name may conflate a real event: angler Cary Winchester's record 108-lb blue catfish, caught in the **Mississippi River** during the 2007 Bass Pro Big Cat Quest at Memphis and released alive. "Catfish as big as cars" is a generic Southern tall tale (Garden & Gun, "Do Giant Catfish Really Exist?").
- **Proposal:** remove or unpublish the pin unless a source is found. If kept, rename it "Mississippi River giant catfish legend (Memphis)", flag it `Legend Only`, and cite the sources.
- **Sources:**
  - KFVS12 (2007): https://www.kfvs12.com/story/7336703/heartland-men-catch-whopper-fish/
  - Garden & Gun: https://gardenandgun.com/giant-catfish-really-exist (removing a pin needs owner approval)

### 094 · The Bibbulmun Track Yowie Zone (Data, source needed)
- **Current:** coordinates −33.9272, 121.8855 (near Esperance, WA).
- **Issue:** The Bibbulmun Track runs from Kalamunda (Perth) to Albany, so these coordinates are not on it. Yowie folklore is mainly associated with eastern Australia. **Source needed** for a Bibbulmun-specific yowie tradition. The copy also attributes the accounts to "Aboriginal" sources without a citation.
- **Proposal:** remove the pin unless a source is found. If one is, correct the coordinates to the relevant track section and cite the source.
- **Sources:**
  - Wikipedia, "Bibbulmun Track": https://en.wikipedia.org/wiki/Bibbulmun_Track
  - Wikipedia, "Yowie": https://en.wikipedia.org/wiki/Yowie

## 2. Duplicates

### 064 "Point Pleasant" and 099 "Point Pleasant — Mothman Bridge" (Data)
- **Issue:** both pins sit at the identical coordinates 38.8479, −82.0004.
- **Proposal:** merge into one pin (keep 099's richer text). Alternatively, keep both at distinct real sites, e.g. the Mothman statue/museum in town vs. the former Silver Bridge site.
- **Source:** Wikipedia, "Mothman": https://en.wikipedia.org/wiki/Mothman (merging or deleting needs owner approval).

## 3. Misfiled categories (Data)

| ID | Pin | Current | Proposed | Why |
|---|---|---|---|---|
| 086 | Lake Toplitz Nazi Cache | UFO | Urban Legend (or a new "Lost Treasure") | WWII-era hidden-documents/counterfeit legend, nothing UFO-related. Source: https://en.wikipedia.org/wiki/Lake_Toplitz |
| 084 | Superstition Mountains | UFO | Urban Legend | Known for the Lost Dutchman's Gold Mine legend. Source: https://en.wikipedia.org/wiki/Lost_Dutchman%27s_Gold_Mine |
| 072 | Teufelsberg | UFO | Abandoned Place | Former Cold War listening station. Source: https://en.wikipedia.org/wiki/Teufelsberg |
| 035 | Blood Falls | Energy Spot | new "Natural Phenomenon" | Red colour comes from iron-rich brine oxidising. Source: https://en.wikipedia.org/wiki/Blood_Falls |
| 034, 048, 027, 082, 088 | Mariana Trench, Lake Natron, Waitomo Glowworm Caves, Surtsey, Fly Geyser | Energy Spot | new "Natural Phenomenon" | Natural features science has explained; "Energy Spot" implies New-Age energy claims (no further source needed for recategorising) |

The "Abandoned Place" and "Other" categories exist in the UI but currently have 0 curated pins.

## 4. Sensitivity

### 002 · Aokigahara: add a help note (Sensitivity)
- **Current:** flagged `Sensitive`; safety note is only "Stay on marked trails."
- **Proposal:** add a short, non-sensational line in the detail view:
  > "Aokigahara is associated with loss of life. If you are struggling or thinking about suicide, please reach out to a local crisis line. You can find one for your country at findahelpline.com."
- Avoid method or statistics detail (common safe-messaging practice), and don't list phone numbers without verifying them.
- **Source:** https://findahelpline.com/

### 062 · Akodessewa Fetish Market: recategorise (Sensitivity)
- **Current:** category "Urban Legend"; copy says "voodoo market".
- **Issue:** This is a real, active market in Lomé, Togo, serving practitioners of **Vodun**, a living West African religion. "Urban Legend" implies a myth.
- **Proposal:** a respectful cultural category (e.g. "Cultural / Sacred Site", or "Strange Experience" until one exists). Use the term "Vodun" and describe it as a religious practice, not a curiosity. Add the `Sensitive` flag. Add a note to respect local customs and ask before photographing people.
- **Sources:**
  - Wikipedia, "Akodessawa Fetish Market": https://en.wikipedia.org/wiki/Akodessawa_Fetish_Market
  - Wikipedia, "West African Vodun": https://en.wikipedia.org/wiki/West_African_Vodun

### Other pins involving deaths or human remains (flags only)
- **Proposal:** add the `Tragic Event` and/or `Sensitive` flags to:
  - 021 Dyatlov Pass
  - 049 Roopkund
  - 018 Poveglia
  - 022 Catacombs of Paris
  - 057 Tower of London
  - 052 Paracas Skulls
  - 079 Atacama skeleton
  - 046 Kalachi
- These flags already exist in code; only data changes are needed.

### 095 · Roswell (Data, minor)
- **Issue:** the pin sits at Roswell city. The 1947 debris was found on a ranch some distance away.
- **Proposal:** mark the pin as approximate, or move it to the ranch area.
- **Source:** Wikipedia, "Roswell incident": https://en.wikipedia.org/wiki/Roswell_incident

## 5. Site-wide trust claims (Framing)
- **Placeholder data:**
  - All 99 pins are `verified:true`.
  - `reports` and `mysteryScore` take only 5 distinct values.
  - All pins share the same `dateAdded`.
- **Proposals:**
  - Show "Verified" only for pins with at least one cited source.
  - Hide report counts until they come from real data.
  - Reword the hero claim "Real locations. Verified facts." until sources exist (owner decision).
