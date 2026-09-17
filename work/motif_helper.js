// motif_helper.js  -- ordered keyword classifier for motif assignment (agent-owned helper)
const fs = require('fs');
const path = require('path');
const DIR = __dirname;

const VALID = `sled skis snowman iceskates cocoa snowballfight snowboard
canoe sailboat paddleboard swimming fishing beach waterfall hotspring scuba
tent campfire backpack binoculars summit trailsign wildflowers climbing bike balloon horse skydive zipline
basketball bowling golf tennis soccer minigolf pingpong frisbee skateboard arcade gym
cooking pizza bbq baking icecream coffee donut taco spicy dinner wine
painting pottery knitting camera sewing candles jewelry
partypopper rubberduck waterballoon karaoke costume fireworks
shopping storefront photobooth museum market library
movie popcorn drivein concert guitar discoball dancing lantern
picnic parkbench kite ferriswheel rose stargazing
boardgame dice puzzle trophy scavenger escaperoom
books chess piano science yoga
tools paintroller birdhouse garden
volunteer donation pet
plane globe castle roadtrip arch spa`.split(/\s+/).filter(Boolean);

// ---- ordered rules: [motif, regex] ; most specific first ----
const R = [
  // ---- highly specific multiword / unambiguous ----
  ['escaperoom', /escape room|escape-room/],
  ['drivein', /drive-?in (movie|theat|theatre|theater)|drive-?in\b/],
  ['photobooth', /photo ?booth|photobooth/],
  ['minigolf', /mini-? ?golf|minigolf|putt-?putt|putt putt/],
  ['pingpong', /ping-? ?pong|table tennis|beer pong|beirut/],
  ['balloon', /hot-? ?air balloon/],
  ['waterballoon', /water ?balloon|water fight|super soaker|squirt gun|water gun|water blaster/],
  ['snowballfight', /snowball/],
  ['skydive', /skydiv|sky-div|bungee|parachut|paraglid|para-glid|hang ?glid|wind ?tunnel|free ?fall/],
  ['zipline', /zip-? ?line|ziplin|ropes course|aerial adventure|via ferrata|alpine slide|alpine coaster|canopy tour/],
  ['scavenger', /scavenger|treasure hunt|geocach|geo-cach|letterbox|metal detect/],
  ['karaoke', /karaoke|lip-? ?sync|lip sync/],
  ['ferriswheel', /ferris|amusement park|theme park|roller ?coaster|carnival|county fair|state fair|midway|fun ?park|water ?park|water slide|waterslide/],
  ['hotspring', /hot spring|hotspring|geothermal|natural spring|soak in/],
  ['waterfall', /waterfall|water fall/],
  ['stargazing', /stargaz|star-gaz|constellation|meteor|aurora|northern lights|milky way|telescope|astronom|night sky|planetarium|moonlight|full moon|eclipse/],
  ['drivein', /drive-?in/],

  // ---- winter ----
  ['snowboard', /snowboard|snow-board/],
  ['skis', /\bski\b|\bskis\b|skiing|ski resort|ski lift|ski lesson|backcountry ski|cross-?country ski|nordic|telemark|ski touring|skin up/],
  ['sled', /sled|sledding|toboggan|snow tub|tube down|tubing hill|inner tube.*snow/],
  ['iceskates', /ice ?skat|skating rink|ice rink|figure skat|hockey|curling|broomball/],
  ['snowman', /snowman|snow ?fort|snow sculpt|snow angel|igloo|quinzhee|snow castle|snow maze|build.{0,15}\bsnow\b/],
  ['cocoa', /hot chocolate|cocoa|hot cider|wassail|warm drink|hot cider/],

  // ---- water ----
  ['scuba', /scuba|snorkel|free-?div|dive certif|underwater|submarine|aquarium/],
  ['paddleboard', /paddle-? ?board|paddleboard|\bsup\b|stand-?up paddle/],
  ['canoe', /canoe|kayak|white-?water|rafting|\braft\b|river run|tubing (down|the river)|float the river|row ?boat|rowing|paddle down|paddle through|paddle a/],
  ['sailboat', /sail(ing|boat)?\b|yacht|catamaran|\bferry\b|boat (tour|ride|cruise|rental)|pontoon|cruise ship|riverboat|gondola ride|boating/],
  ['fishing', /fish(ing|erman)?\b|angling|fly-?fish|catch (and release|a fish)|bait/],
  ['swimming', /swim|pool\b|lap swim|cannonball|dive into the|skinny dip|water aerobics|splash pad/],
  ['beach', /beach|sand ?castle|seashore|shoreline|sea ?shell|sunbath|lakeshore|lake day|oceanfront|surf/],

  // ---- outdoors ----
  ['climbing', /rock ?climb|bouldering|\bboulder\b|climbing gym|rappel|belay|top-?rope|climbing wall|ice climb/],
  ['summit', /summit|\bpeak\b|mountaintop|mountain top|scramble|highest point|\bsummit\b|reach the top|alpine ridge|ridge line|via the ridge/],
  ['tent', /camp(ing|site|ground)?\b|\btent\b|sleep(ing)? (out|under the stars)|overnight in the|glamping|bivouac/],
  ['campfire', /campfire|bonfire|s'?more|fire ?pit|fire circle|roast marshmallow/],
  ['backpack', /backpack|thru-?hike|overnight hike|\btrek\b|pack (in|out)|day pack/],
  ['binoculars', /bird-? ?watch|birding|wildlife (watch|view|spot)|whale watch|scenic (overlook|lookout|viewpoint)|观|spot (animals|wildlife)|lookout tower|观鸟|watch for (elk|deer|moose|bison)|safari/],
  ['wildflowers', /wildflower|flower field|blossom|tulip|lavender|sunflower|botanical|arboretum|flower farm|bloom/],
  ['trailsign', /hike|hiking|\btrail\b|nature walk|nature trail|walk in the (woods|forest)|forest walk|canyon walk|foothills|switchback/],
  ['bike', /\bbike\b|biking|bicycl|cycling|\bcycle\b|mountain bik|road bik|tandem|\be-?bike\b|pedal/],
  ['horse', /horse|equestrian|\bpony\b|stable|saddle|trail ride|rodeo|ranch ride/],

  // ---- sports / rec ----
  ['bowling', /bowl(ing|s)?\b|bowling alley|strike and spare/],
  ['golf', /\bgolf\b|driving range|golf course|top ?golf/],
  ['tennis', /tennis|pickle-? ?ball|badminton|racquet|squash court/],
  ['basketball', /basketball|\bhoops?\b|free ?throw|shoot around|pick-?up game|\bnba\b|dunk/],
  ['soccer', /soccer|futbol|football (match|game|club)|\bfifa\b|penalty kick/],
  ['frisbee', /frisbee|disc golf|\bdisc\b|ultimate|spikeball|corn ?hole|kan ?jam|bocce|horseshoe|ladder ?ball|ring toss|lawn game|yard game|giant jenga|croquet/],
  ['skateboard', /skate-? ?board|skateboarding|roller ?skat|rollerblad|inline skat|skate park|longboard|scooter/],
  ['arcade', /arcade|pinball|video ?game|laser tag|claw machine|\bvr\b|virtual reality|axe throw|ax throw|nintendo|playstation|xbox|mario ?kart|retro game|whack-a-mole|air hockey|foosball|dave and buster|nickelcade|trampoline park|bounce house|ninja (course|warrior)|batting cage|go-?kart|bumper car|paintball|airsoft|nerf/],
  ['gym', /\bgym\b|workout|weight ?lift|fitness|crossfit|spin class|exercise|boot ?camp|obstacle course race|\b5k\b|marathon|\brun (a|the)\b|jogging|running club|martial art|karate|boxing|jiu-?jitsu|kickbox|aerial silk|trapeze|parkour|\bplank\b|push-?up|circuit train/],

  // ---- food ----
  ['pizza', /pizza|calzone|pizzeria/],
  ['donut', /donut|doughnut|\bkrispy\b/],
  ['icecream', /ice ?cream|gelato|sundae|frozen yogurt|froyo|shave(d)? ice|snow ?cone|milkshake|\bsorbet\b|soft serve|popsicle|italian ice|creamery/],
  ['taco', /taco|burrito|nacho|quesadilla|salsa (bar|making|recipe|tasting)|tamale|churro|enchilada|mexican (food|restaurant|place)|\bcarne\b|elote/],
  ['spicy', /spicy|hot sauce|hot wing|ghost pepper|habanero|jalapeno|scoville|spice challenge|chili pepper|fire noodle|\bwasabi\b|carolina reaper|spice-forward|spicy food/],
  ['bbq', /\bbbq\b|barbecue|barbeque|grill(ing|ed)?\b|smoker|brisket|\bribs\b|cookout|\bkabob\b|kebab|hot dog roast|smoke meat/],
  ['baking', /bak(e|ing|ery)|\bcake\b|cookie|cupcake|\bpie\b|brownie|pastry|\bbread\b|croissant|macaron|cinnamon roll|frosting|decorate.*(cake|cookie)|scone|muffin|dessert|\bpretzel\b|candy (making|apple)|\bfudge\b|caramel apple|churn|cheesecake|\btart\b/],
  ['coffee', /coffee|espresso|\bcafe\b|latte|cappuccino|\bmocha\b|tea (shop|house|party|tasting|ceremony)|\bboba\b|bubble tea|chai|\bbarista\b|coffee shop|matcha/],
  ['wine', /\bwine\b|vineyard|winery|cocktail|mocktail|brewery|\bbrew\b|cider (tast|mill|house)|distiller|\bmead\b|kombucha|soda shop|dirty soda|drink (tasting|flight)|mixology|smoothie|juice bar|lemonade stand|root beer/],
  ['cooking', /cook(ing|book)?\b|recipe|\bkitchen\b|meal prep|\bsoup\b|\bchili\b|\bpasta\b|\bstir-?fry\b|\bramen\b|\bcurry\b|\bsushi\b|\bdumpling\b|\bstew\b|\bsauce\b|make (dinner|lunch|breakfast|food)|from scratch|\bomelet|pancake|waffle|\bbrunch\b|\bfry\b|\bwok\b|noodle|\btofu\b|\bpho\b|\bpaella\b|\brisotto\b|food truck|iron chef|chopped challenge|blind taste|taste test|eating (contest|challenge)|food challenge|buffet|all-you-can-eat|charcuterie|cheese (board|tasting)|breakfast (board|spread|in bed)|picky eater|mystery ingredient/],
  ['dinner', /dinner|restaurant|dine|fine dining|reservation|\bsupper\b|dinner date|\bbistro\b|\bdiner\b|lunch (date|spot)|eat at|meal out|takeout|take-?out|\bmenu\b|chef's table|progressive meal/],

  // ---- arts / crafts ----
  ['pottery', /pottery|ceramic|\bclay\b|wheel throw|\bkiln\b|paint.{0,12}pottery|porcelain|sculpt/],
  ['knitting', /knit|crochet|\byarn\b|weav(e|ing)|macrame|loom|felting|spin wool/],
  ['sewing', /\bsew\b|sewing|quilt|embroider|cross-?stitch|\bstitch\b|tie-?dye|\bfabric\b|upholster|\bapron\b|make (a shirt|clothes)|screen ?print|patchwork|mend/],
  ['jewelry', /jewelry|jewellery|\bbead\b|beading|bracelet|necklace|\bearring|ring (making|forge)|friendship bracelet|charm/],
  ['candles', /candle/],
  ['camera', /photo(graph|shoot)|\bcamera\b|polaroid|\bfilm (camera|roll|shoot)|selfie|disposable camera|instax|\bphotos\b|picture-?taking|photo (walk|series|challenge|scavenger)|time-?lapse|drone footage|videograph|make a (video|film|movie) (together|of)/],
  ['painting', /paint(ing|er)?\b|\bcanvas\b|watercolor|acrylic|\bmural\b|sketch|draw(ing)?\b|art class|paint and sip|\bdoodle\b|calligraph|charcoal|\bpastel\b|art journal|\bcollage\b|\bgraffiti\b|chalk art|sidewalk chalk|paint-by|abstract art|\bmosaic\b|origami|\bstencil\b|scrapbook|\bcraft\b|\bdiy art\b|\bstamp/],

  // ---- silly ----
  ['costume', /costume|dress ?up|cos-?play|halloween|\bwig\b|disguise|thrift.{0,20}outfit|matching outfit|onesie|superhero|pajama|\bmascot\b|swap clothes|outfit challenge|dress each other/],
  ['fireworks', /firework|sparkler|roman candle|new year'?s eve/],
  ['rubberduck', /rubber duck|\bduck\b|ducky/],
  ['partypopper', /\bparty\b|confetti|celebrat|surprise (party|them)|birthday|anniversary|\btoast\b|balloon (drop|arch)|streamer|\bprank\b|april fools|silly (challenge|contest)|goofy|shenanigan|dare each other|\bdares\b|truth or dare/],

  // ---- shopping / city ----
  ['market', /farmer'?s? market|flea market|night market|swap meet|produce stand|craft fair|artisan market|\bbazaar\b|street market|vendor/],
  ['library', /library|book ?store|bookshop|used book/],
  ['museum', /museum|art gallery|\bgallery\b|exhibit|historic(al)? (site|society|museum)|\bzoo\b|science center|visitor center|cultural center|heritage|\bplanetarium\b|observatory tour|memorial|monument/],
  ['shopping', /shop(ping)?\b|thrift|\bmall\b|second-?hand|antique|\bstore\b|garage sale|yard sale|boutique|window shop|dollar store|\bcostco\b|\bikea\b|\btarget\b|\bwalmart\b|\bsale\b|\bdeal\b|price tag|checkout|shopping cart|\baisle\b|\bregister\b|gift shop/],

  // ---- screens / stage ----
  ['popcorn', /popcorn/],
  ['concert', /concert|live music|\bband\b|symphony|orchestra|music festival|\bgig\b|open mic|\bopera\b|\bchoir\b|\brecital\b|acoustic set|jazz (show|performance|club|night)|\bdj\b|music venue/],
  ['guitar', /guitar|ukulele|\bbanjo\b|\bviolin\b|\bfiddle\b|instrument|jam session|write a song|songwrit|\bdrum/],
  ['piano', /piano|keyboard lesson|\borgan\b|\bkeys\b/],
  ['discoball', /disco|night ?club|\bclub night\b|\brave\b|dance party|glow party|silent disco|\bdj set\b/],
  ['dancing', /danc(e|ing|er)|salsa|swing (dance|dancing)|waltz|ballroom|line danc|tango|two-?step|ballet|choreograph|square danc|\bzumba\b|hip-?hop class|\bprom\b/],
  ['lantern', /lantern|luminari|string light|\bfairy light|paper lamp|glow stick|light display|christmas lights|light festival|candlelit walk|\bglow\b/],
  ['movie', /movie|\bfilm\b|cinema|theater|theatre|\bplay\b (at|the theat)|\bbinge\b|tv (show|series)|watch (a|an|the|old|home)|screening|documentary|netflix|marathon of|\bshow\b|\bmusical\b|comedy (show|club)|stand-?up|improv|\bbroadway\b|puppet show|magic show|circus/],

  // ---- parks / romance ----
  ['picnic', /picnic|blanket (in|at) the|basket lunch|eat (outside|in the park)|spread.*blanket/],
  ['kite', /\bkite\b|kite-?flying|\bparasail/],
  ['rose', /\brose\b|\bflowers?\b|bouquet|love (letter|note)|romantic gesture|\bvalentine|\bproposal\b|write.*love|\bcourt(ship)?\b|serenade|first date reenact|\bromance\b/],
  ['parkbench', /park bench|\bbench\b|people ?watch|sit (in|at) the park|city park|stroll|\bwalk\b|\bpark\b|promenade|boardwalk|\bplaza\b|downtown|\bpath\b|\bgreenway\b/],

  // ---- games ----
  ['boardgame', /board ?game|monopoly|\bcatan\b|game night|card game|\buno\b|\bjenga\b|\bclue\b|risk\b|scrabble|\bcharades\b|\btrivia\b|pictionary|\bbingo\b|tabletop|\bd&d\b|dungeons|role-?playing game|\bbanagrams\b|\bcribbage\b|\bpoker\b|\bsolitaire\b|\bmahjong\b|party game|two-?player game/],
  ['dice', /\bdice\b|yahtzee|\bgambl|\bcasino\b|roll (a|the) die|chance game|\bluck\b|coin flip|random(ize|izer)/],
  ['puzzle', /puzzle|jigsaw|crossword|sudoku|riddle|brain ?teaser|rubik|logic game|word search/],
  ['chess', /\bchess\b|checkers|\bbackgammon\b|\bgo board\b|strategy game/],
  ['trophy', /tournament|competition|\bcontest\b|championship|\bbracket\b|\bversus\b|\bwinner\b|\bbeat each other\b|compete|\bolympics\b|\bchallenge\b|\bduel\b|\bmatch(up)?\b|score keep|leaderboard|\bbet\b/],

  // ---- learning ----
  ['books', /\bbook\b|\bread(ing)?\b|poetry|\bpoem\b|\bwrit(e|ing)\b|\bnovel\b|\bjournal\b|\bstory\b|storytell|\bletters?\b|\blearn about\b|\bhistory of\b|\bresearch\b|\bstudy\b|\blanguage\b|\bvocabulary\b|\bclass on\b|\blecture\b|\bcourse\b/],
  ['science', /science|experiment|\blab\b|chemistry|physics|\bmicroscope\b|robot|coding|\bcode\b|circuit|\bsolar\b|volcano|\bslime\b|\bstem\b|engineer|3d print|\bdrone\b|electronic|\bmath\b/],
  ['yoga', /yoga|meditat|\bstretch|pilates|mindful|breath ?work|\btai chi\b|sound bath|\bzen\b|\bcalm\b|relaxation|\bpose\b|barre class/],

  // ---- DIY / building ----
  ['birdhouse', /bird ?house|bird ?feeder|bird ?bath/],
  ['garden', /garden|\bplant(s|ing)?\b|\bseed/, ],
  ['paintroller', /paint (the|a|your) (wall|room|fence|door|house|kitchen)|repaint|room makeover|redecorat|wallpaper|\bwhitewash\b|paint roller/],
  ['tools', /\bbuild\b|\bbuilding\b|construct|\bhammer\b|woodwork|\bcarpent|\brepair\b|\bfix\b|furniture|\bshelf\b|\bshelves\b|\bdiy\b|\bworkshop\b|\bsaw\b|\bdrill\b|\bnail\b|\bscrew\b|\bassemble\b|\bbirdhouse\b|\bfort\b|tree ?house|\bbench build\b|restore|\bproject\b|\bmake a\b|\bcraft a\b|\bwelding\b|\bforge\b|\bmetalwork\b/],

  // ---- service ----
  ['pet', /\bpet\b|\bdog\b|\bpuppy\b|\bcat\b|\bkitten\b|animal shelter|humane society|\bfoster\b|\bkennel\b|dog park|\banimal/],
  ['donation', /donat|charit|fundrais|\bgive back\b|care package|\bgift\b|\bgiving\b|toy drive|food drive|\bcanned food\b|\bsponsor\b|\bpay it forward\b|\btip\b/],
  ['volunteer', /volunteer|\bserve\b|\bservice\b|soup kitchen|\bshelter\b|clean-?up|\bcleanup\b|pick up (trash|litter)|help (out|at|a neighbor)|community (service|garden|project)|\bmentor\b|\bnursing home\b|\bhabitat for\b|\bneighbor\b|\bkindness\b|\brandom acts?\b/],

  // ---- travel / bucket list ----
  ['plane', /\bflight\b|\bfly(ing)?\b|airport|airplane|\bjet\b|\bhelicopter\b|\bairshow\b|air show|\bpilot\b|red-?eye|boarding pass/],
  ['arch', /\barch(es)?\b|national park|red rock|\bcanyon\b|\bmoab\b|\bzion\b|\bbryce\b|delicate arch|\bmesa\b|\bslot canyon\b|\bdesert\b|\bhoodoo\b|\bgoblin valley\b|monument valley|\bcapitol reef\b|\bcanyonlands\b/],
  ['castle', /castle|\bpalace\b|\btemple\b|\bcathedral\b|\bmansion\b|\bfort(ress)?\b|\bruins\b|ancient (site|city)|\bpyramid\b|\bmanor\b|\bchateau\b|\babbey\b|\bmonaster/],
  ['spa', /\bspa\b|massage|\bsauna\b|facial|self-?care|bath ?bomb|\bhot tub\b|\bpedicure\b|\bmanicure\b|\bsalon\b|\bhaircut\b|\bsteam room\b|\bfloat tank\b|pamper/],
  ['roadtrip', /road ?trip|scenic drive|\bdrive to\b|\bdriving\b|\bcar ride\b|\bcross-?country\b|\bhighway\b|\bbyway\b|\bdetour\b|\bgas station\b|\bmap out a route\b|\bdrive\b/],
  ['globe', /\btravel\b|\bworld\b|\bcountry\b|\bcountries\b|passport|international|\bglobal\b|\bmap\b|\bculture\b|\bforeign\b|\babroad\b|\bcontinent\b|\bglobe\b/],
  ['storefront', /\blocal\b|\bbusiness\b|\bdowntown\b|\bshop local\b|\bmain street\b|\bprovo\b|\bboutique\b/],
];

const rules = R.map(([m, re]) => {
  if (!VALID.includes(m)) throw new Error('invalid motif in rules: ' + m);
  return [m, new RegExp(re.source, 'i')];
});

function classify(title, desc) {
  const t = title.toLowerCase();
  for (const [m, re] of rules) if (re.test(t)) return [m, 'T'];
  const d = (title + ' ' + desc).toLowerCase();
  for (const [m, re] of rules) if (re.test(d)) return [m, 'D'];
  return ['', '-'];
}

const ideas = JSON.parse(fs.readFileSync(path.join(DIR, 'ideas_input.json'), 'utf8'));
const out = {};
const src = {};
for (const i of ideas) {
  const [m, s] = classify(i.title, i.description || '');
  out[i.id] = m; src[i.id] = s;
}
fs.writeFileSync(path.join(DIR, 'motif_auto.json'), JSON.stringify(out));

const mode = process.argv[2] || 'stats';
if (mode === 'stats') {
  const c = {}; let none = 0;
  for (const id in out) { if (!out[id]) none++; else c[out[id]] = (c[out[id]] || 0) + 1; }
  console.log('unmatched:', none);
  console.log(Object.entries(c).sort((a, b) => b[1] - a[1]).map(x => x[0] + ':' + x[1]).join('  '));
} else if (mode === 'none') {
  for (const i of ideas) if (!out[i.id]) console.log(i.id + '|' + i.category.slice(0, 12) + '|' + i.title + ' :: ' + (i.description || '').slice(0, 95));
} else if (mode === 'motif') {
  const want = process.argv[3];
  for (const i of ideas) if (out[i.id] === want) console.log(i.id + '|' + i.title + ' :: ' + (i.description || '').slice(0, 80));
} else if (mode === 'range') {
  const a = +process.argv[3], b = +process.argv[4];
  for (const i of ideas) if (i.id >= a && i.id <= b) console.log(i.id + '|' + out[i.id] + '|' + i.title + ' :: ' + (i.description || '').slice(0, 88));
}
