/**
 * The default word list of the passphrase generator: 1548 short, common English words of 3 to 8 letters, about 10.6 bits
 * of entropy each. Loaded only when a passphrase is generated without a `wordList` of the app's own.
 */
const words =
  'able absorb acid acorn acre acrobat actor adapt admiral admit adobe adopt adult aerial agent agile agree ahead aisle alarm album alcove alder alert ' +
  'alien alley allow almanac almond aloud alpha alpine amber amend amethyst ample amulet anchor angel angle anise ankle annex answer antique antler anvil ' +
  'apex apple apricot april apron aqua aquarium arbor arcade arch archer arctic ardent arena argue armada armor army aroma arrow artisan artist ashore ' +
  'aspen asphalt asteroid athlete atlas atom atrium attic auburn audio august aunt aurora autumn avenue aviary avocado awake award axis azure backpack ' +
  'bacon badge badger bagel baker balcony ballad ballet ballroom bamboo banana band bandana banjo banner barber barge barley barn barnacle barrel basalt ' +
  'baseball basil basin basket batch bayou bazaar beach beacon beagle beam bean beanbag bear beaver bedrock beeswax beetle bellhop bellow bellows bench ' +
  'beret berry bicycle billow bingo biplane birch birdbath biscuit bison bistro blackout blade blanket blaze blazer blend blimp blink bloom blossom blue ' +
  'bluebird bluff board boat bobcat bobsled bonfire bonnet bonus book bookcase bookend boost boot border bottle boulder bounce bouquet bowl bowtie box ' +
  'boxcar bracelet bramble brass brave bread breeze brick bridge brief bright brisk bronze brook broom brownie brush bubble bucket buckeye buckle buddy ' +
  'budget buffalo bugle bulldog bundle bungalow bunny burlap burrow butter button buzz cabaret cabin cable cablecar cactus caddie cadence cadet cake ' +
  'calendar calico calm camel cameo camera camp campfire canal candle candor candy canoe canopy canvas canyon cape capsule captain caramel caravan carbon ' +
  'cardinal cargo carousel carpet carrot cart cartoon cascade cashew castle catalog catapult cattle cave cavern caviar cedar celery cello cement cereal ' +
  'chalet chalk chamber chandler chapel charm chart cheek cheerful cheese cheetah cherry chess chest chestnut chime chimney chip chipmunk choir chorus ' +
  'chowder cider cinder cinema cinnamon circle circus citadel citrus civic clam clarinet clay clever cliff climb clipper clock cloud cloudy clover coach ' +
  'coast cobalt cobble cocoa coconut cocoon coffee collar colonel comet comic compass condor console cookie copper coral corduroy cork corn cornet corral ' +
  'cosmos cottage cotton couch cougar cousin cove cowboy coyote cradle craft crane crater crayon cream creek crescent crest cricket crisp crocus croquet ' +
  'crossbow crown crumb crystal cube cup cupboard cupcake curve cushion custard cycle cyclone cymbal dahlia daisy dance dapper dawn daylight deckhand ' +
  'decoy deer delta denim desert desk dial diamond diary diesel dinghy dingo dinner diploma dispatch dock dolphin domain donkey doodle door doorbell ' +
  'doorway dormouse dough dove downtown dragon drama drawer dream drift driveway drizzle drum duck dumpling dune dusk dwarf dynamo eagle earmuff earth ' +
  'easel easterly eastward easy echo eclipse eggplant eggshell egret elbow elder elegant elephant elevator elk elm embassy ember emblem emerald empire ' +
  'engine engineer enjoy envelope envoy epic equal equator ermine estate estuary ethic evening exact exit expert extra fable fabric fairway falcon family ' +
  'fancy farm feast feather fence fennel fern ferris ferry festival fever fiber fiddle fiddler field fiesta fig filbert film finch fire firefly fireside ' +
  'fjord flag flagpole flame flamingo flannel flapjack flash flatbed fleet flicker flint float flock flora flour flower flute focus fog foghorn folder ' +
  'fondue footpath forecast forest forge fork fortune fossil fountain fox frame freckle freeway fresco fresh friend fringe frog frolic frontier frost ' +
  'fruit fudge fungus funny gable gadget galaxy galleon galley gallon gambit gander gangway garage garden gardener garland garlic garnet garnish gate ' +
  'gateway gauge gazebo gazelle gecko gem gemstone genius gentle geyser giant ginger gingham giraffe glacier glad glass glen glider glimmer globe glove ' +
  'glow goat goblet gold goldfish golf gondola goose gopher gorilla gospel gourd gradient grain granite granola grape graph graphite grass gravel gravy ' +
  'great green greenery grid griddle grill grizzly grotto grove guard guardian guava guide guitar gull gum gumbo gumdrop gusto gym habit haiku hairpin ' +
  'halibut hamlet hammer hammock hamster hand handbell harbor harmony harp harpoon harvest hat hatch hawk hazel headland heart hearth heather hedge ' +
  'heirloom helium helmet herb hermit hero heron hickory highland hill hilltop hinge hippo hobby hollow honey honeybee honeydew hood hook hope horizon ' +
  'hornet horse hotdog hotel hound house huckster humble hummus hurdle hut hydrant hyena iceberg icicle icon idea igloo ignite image impala imprint index ' +
  'indigo ink inkpot inkwell inlet insect inventor iris island ivory ivy jackal jacket jaguar jam jamboree jar jasmine jazz jeans jelly jester jetpack ' +
  'jetty jewel jigsaw jingle jockey jolly journal journey jubilee judge juice jukebox jumbo junction jungle junior juniper jury kayak keepsake kelp ' +
  'kennel kernel kestrel kettle key keyboard keystone kickoff kidney kimono kind kindling king kingdom kingfish kiosk kipper kitchen kite kitten kiwi ' +
  'knapsack knee knight knot koala label lacquer ladder ladle lady lagoon lake lakeside lamb lamp lamppost landmark lantern lanyard lapel laptop larch ' +
  'large lark laser lasso latch lattice lava lavender lawn layer leaf ledge legend lemon lemur lens lentil letter lettuce level lever library lichen ' +
  'lifeboat lilac lily lime limeade limerick linden linen lion liquid list lizard llama lobby lobster locket locust lodge logic lollipop lookout lotus ' +
  'lowland lucky lullaby lumber luminous lunar lunch lute lynx lyric macaw machine mackerel magenta magician magnet magpie mailbox mainsail maize mallard ' +
  'mammoth manatee mandarin mandolin mango manor mantle map maple marathon marble march margin marigold marina marine market marmot marsh marshal mascot ' +
  'mask masonry meadow medal meerkat melody melon memo menu meringue mermaid metal meteor method metro middle midnight mild mill millet mineral minnow ' +
  'mint mirror mistral mitten mixer mocha model modem mole moment monkey monsoon moon moonbeam moorland moose morning mortar mosaic moss motor mountain ' +
  'mouse mudslide muffin mulberry mural muscle museum mushroom music mussel mustang mustard myth napkin narrow narwhal nation native nature nautical navy ' +
  'nebula necklace nectar needle nest nestling net nickel night nightcap nimble noble nocturne nomad noodle north notch note notebook nougat novel nugget ' +
  'number nurse nutmeg nutshell oak oarsman oasis oat oatmeal obelisk object ocean ocelot octave octopus office offshore olive omega onion onyx opal ' +
  'opera opossum orange orbit orchard orchid organ origin osprey otter ottoman outback outfit outpost oval oven overcoat overpass owl oxygen oyster ' +
  'paddle paddock page pagoda paint paisley palace palette palm pancake panda panel panorama panther papaya paper paperboy paprika parade parasol parcel ' +
  'park parkway parlor parrot parsley parsnip party passage pasta pastel pastry patch path pathway peach peacock peak peanut peapod pear pebble pecan ' +
  'pedal pelican pencil pendant penguin peony pepper perch pergola pesto petal pewter pheasant piano pickle picnic pigeon pillow pilot pine pinecone ' +
  'pinnacle pinwheel pioneer pirate pixel pizza plaid planet plank plateau platypus playroom plaza plover plum plywood poem polar pollen poncho pond pony ' +
  'popcorn poppy porch portal postcard posture potato pothole pottery powder prairie praline pretzel primrose prism pudding puddle puffin pullover pulse ' +
  'pumice pumpkin puppet puppy purple pushcart puzzle pyramid quail quarry quartz queen quest quiche quick quiet quilt quince quiver quokka quote rabbit ' +
  'raccoon radar radiant radio radish raft rain rainbow raincoat raisin rake ramp rampart ranch rattle raven ravine razor recipe recital redbird redwood ' +
  'reef reflex regatta reindeer relic relish remote rhubarb rhythm ribbon rice rickshaw riddle ridge ring ripple river riverbed road roadside roadway ' +
  'robin robot rocket rodeo roof rooftop rookie rose rosebud rosemary rosewood rotor round roundup rover rowboat rowhouse royal ruby rudder rugby ruler ' +
  'rumble runway rustic saddle safari saffron saga sage sail sailboat salad salmon salsa salt sand sandal sandbox sapphire sardine satchel satin saucer ' +
  'sausage savanna sawmill scale scallop scarf scepter school schooner scooter scout script sea seal seashell seaside season seed seesaw sequoia sesame ' +
  'sextant shadow shamrock shark sheep shell shelter sherbet sherpa shield ship shipyard shoal shoebox shore shovel shrimp shrub sidecar sienna signal ' +
  'silk silkworm silver simple siren sketch ski skillet sky skylark skyline slate sled slipper slope snail snake snow snowball snowcap snowdrop snowfall ' +
  'soap soccer socket sofa softball solar songbird sonnet sorbet sorrel soup spaniel spark sparkle sparrow sphinx spice spider spinach spinner spiral ' +
  'splash sponge spoon spring springer sprout spruce square squash squid stable stadium stage stamp star starfish starling statue steam steel stem ' +
  'stingray stockpot stone stool storm story stove straw stream street strudel studio sugar summer summit sun sunbeam sundial sunlight sunrise sunroom ' +
  'sunset supper surf swallow swan sweater sweetpea swift sycamore symbol syrup table tablet tabletop taco tadpole tailwind talent tambour tango tank ' +
  'tape tapestry target tarragon tavern teacup teal teapot teardrop telegram temple tennis tent terrace textbook thicket thimble thistle thread throne ' +
  'thrush thunder thyme ticket tiger timber tin tiptoe toast toboggan toffee token tomato tool toolbox topaz topsoil torch tornado tortoise toucan tower ' +
  'towpath toy track tractor trail train travel treaty tree treetop trellis trench tribe tricycle trinket trolley trophy trout truck trumpet tugboat ' +
  'tulip tuna tundra tunnel turbine turkey turnip turtle tuxedo twig twilight twin ukulele umber umbrella uncle underdog unicorn union unit universe ' +
  'uplift upper upstream uptown urban usher utopia vacuum valiant valley valve vanguard vanilla vapor vase velvet vendor venue veranda verse vervain ' +
  'vessel vest vicuna viewport viking village vine vineyard vinyl viola violet violin virtue visa visit vista vivid voice volcano voyage vulture wafer ' +
  'waffle wagon walnut walrus waltz wander warbler wardrobe warm wasabi water waterway wave wax weasel weather wedge weekend wetland whale wheat wheel ' +
  'whisper whistle widget wigwam wildcat willow windmill window windsock wingspan winter wizard wolf wombat wonder wood woodland woodpile wool workshop ' +
  'world worm wren wrist yacht yak yard yarn yawn year yearbook yeast yellow yodel yogurt yolk yonder young yucca zebra zenith zephyr zero zest zigzag ' +
  'zinc zinnia zipper zone zoom zucchini'

export default words.split(' ')
