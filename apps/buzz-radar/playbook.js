// Buzz Radar playbook: teaching content about video game media buying.
// Plain data, no DOM, no dependencies. app.js joins ARCHETYPES to analysis.js
// clusters by archetype id. All strings are plain text (never HTML).
//
// Sourcing rule: every number or named example carries a sourceUrl that was
// seen during research. Rate figures from agency or marketplace blogs are
// labelled as such, because nobody publishes audited creator rate cards.

const SRC = {
  ftcInfluencers: "https://www.ftc.gov/business-guidance/resources/disclosures-101-social-media-influencers",
  ftcFaq: "https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking",
  asaRecognising: "https://www.asa.org.uk/advice-online/recognising-ads-social-media.html",
  asaInfluencers: "https://www.asa.org.uk/advice-online/influencers-guide.html",
  ytPaidPromo: "https://support.google.com/youtube/answer/154235",
  ytViewerLabel: "https://support.google.com/youtube/answer/10588440",
  twitchSponsorships: "https://www.twitch.tv/creatorcamp/en/level1/monetization/sponsorships",
  twitchBrandedBacktrack: "https://techcrunch.com/2023/06/07/twitch-backtracks-on-changes-to-branded-content-rules-after-streamer-backlash/",
  twitchDrops: "https://dev.twitch.tv/docs/drops/technical-guide/",
  apexNinja: "https://www.pcgamer.com/ninjas-sponsored-apex-legends-launch-stream-cost-ea-dollar1-million-reuters-report-says",
  wsj50k: "https://kotaku.com/top-streamers-said-to-earn-50-000-an-hour-playing-new-1834898693",
  tubefilter50k: "https://www.tubefilter.com/2019/05/21/ninja-twitch-streamers-earn-per-hour-game-developers-pay-streamers/",
  kellogg: "https://insight.kellogg.northwestern.edu/article/video-game-companies-are-spending-big-on-sponsored-streams",
  raidBuzzGuru: "https://gameworldobserver.com/2021/12/24/plarium-spent-8-66-million-on-youtube-ads-for-raid-shadow-legends-over-last-six-months",
  raidGamerant: "https://gamerant.com/youtubers-sponsor-raid-shadow-legends/",
  raidNavi: "https://www.pocketgamer.biz/news/75582/raid-shadow-legends-dev-plarium-partners-with-esports-firm-navi/",
  streamsChartsSponsored: "https://streamscharts.com/news/sponsored-streams-gaming",
  streamsChartsH1_2026: "https://streamscharts.com/news/top-h1-2026-game-launches-publisher",
  sgfKotaku: "https://kotaku.com/summer-game-fest-sgf-prices-trailer-cost-e3-keighley-1851523472",
  sgfGameDev: "https://gamedeveloper.com/business/report-summer-games-fest-trailers-can-cost-devs-up-to-550k",
  ytAdViews2011: "https://techcrunch.com/2011/06/19/youtube-counts-video-ads-regular-views",
  ytTopTrailerAds2017: "https://gamesbeat.com/youtubes-top-game-trailers-of-2017-minions-get-more-hits-than-star-wars-battlefront-ii/",
  googleVideoViews: "https://support.google.com/google-ads/answer/13982458?hl=en",
  embargoKotaku: "https://kotaku.com/how-video-game-review-restrictions-work-and-dont-1846199977",
  fortniteSac: "https://www.epicgames.com/help/c-34406160/a19029301",
  fortniteSacTerms: "https://legal.epicgames.com/fortnite/eula/sac",
  streamElements: "https://www.tubefilter.com/2025/02/25/stream-elements-sponsorship-opportunities-twitch-streamer-dashboards/",
  streamElementsHelp: "https://support.streamelements.com/hc/en-us/articles/24600463727506-Staying-Compliant-A-Guide-to-Sponsorship-Campaign-Compliance",
  keymailerFaq: "https://account.keymailer.co/faq/1",
  xsollaKeys: "https://xsolla.com/blog/how-to-distribute-game-keys-among-video-influencers",
  gamedevInfluencerScams: "https://www.gamedeveloper.com/game-platforms/avoiding-ineffective-or-scam-discovery-interactions-with-influencers",
  amongUsKotaku: "https://kotaku.com/among-us-improbable-rise-to-the-top-of-twitch-1844986025",
  amongUsPcGamer: "https://pcgamer.com/how-among-us-became-so-popular",
  amongUsStreamsCharts: "https://streamscharts.com/news/phenomena-2020-among-us",
  lethalGameDev: "https://gamedeveloper.com/business/lethal-company-sold-an-estimated-10-million-copies",
  balatroPcGamer: "https://pcgamer.com/games/card-games/balatro-publisher-playstack-only-discovered-it-because-they-had-a-guy-checking-all-the-new-releases-on-steam-every-day-i-saw-the-game-the-day-it-went-up-on-steam",
  balatroGameDiscover: "https://newsletter.gamediscover.co/p/how-balatro-hit-1-million-sales-in",
  palworldGamespot: "https://gamespot.com/articles/palworld-just-passed-2-million-concurrent-players-on-steam-only-second-game-to-ever-to-do-so/1100-6520583/",
  palworldStreamsCharts: "https://streamscharts.com/games/palworld/release-stats",
  palworld10: "https://www.gamesradar.com/games/survival/palworld-devs-had-high-expectations-for-1-0-but-with-over-855-000-concurrent-steam-players-lead-says-this-is-staggering/",
  helldiversPcGamer: "https://www.pcgamer.com/helldivers-2-player-counts-more-than-double-launch-weekend-300k-and-climbing-as-the-co-op-shooter-goes-viral",
  helldiversPrepared: "https://gamesradar.com/games/third-person-shooter/helldivers-2-lead-thought-it-would-bang-but-not-that-hard-we-were-prepared-for-having-150-000-players-peak-ccu",
  hogwartsTwitch: "https://gamesradar.com/hogwarts-legacy-topples-cyberpunk-2077-to-smash-twitch-record-despite-controversy",
  hogwartsRollingStone: "https://www.rollingstone.com/culture/rs-gaming/hogwarts-legacy-game-jk-rowling-transphobia-1234676730/",
  steamReviewBombs: "https://www.pcgamer.com/valve-takes-steps-against-steam-review-bombs",
  steamHistogram: "https://pcgamer.com/valve-aims-to-combat-steam-review-bombing-with-new-histogram-charts",
  travisScott: "https://www.pcgamer.com/travis-scotts-fortnite-show-had-a-record-breaking-number-of-players",
  genshinCreator30: "https://gameriv.com/genshin-impact-version-3-0-creator-program-on-twitch-registration-details-rules-and-rewards/",
  digidayMidTier: "https://digiday.com/marketing/as-big-contracts-dry-up-for-top-gaming-creators-smaller-to-mid-sized-influencers-see-opportunity/",
  digidayEsports: "https://digiday.com/marketing/the-model-is-shifting-in-esports-brand-dollars-increasingly-follow-the-personalities/",
  attMoloco: "https://www.moloco.com/press-releases/moloco-report-since-ios-14-6-advertising-costs-for-casual-games-dropped-38-and-jumped-78-for-core-games",
  attAdExchanger: "https://www.adexchanger.com/mobile/ua-for-game-developers-is-an-entirely-different-animal-in-the-post-att-era/",
  attPocketGamer: "https://www.pocketgamer.biz/news/83559/att-continues-taking-a-toll-the-cheapest-cpi-on-apple-still-costs-more-than-the-priciest-on-android/",
  wishlistConversion: "https://newsletter.gamediscover.co/p/the-state-of-steam-wishlist-conversions",
  nextFestZukowski: "https://howtomarketagame.com/2022/07/11/june-2022-steam-next-fest-how-did-these-games-earn-so-many-wishlists/",
  rateYouTube: "https://influencerfee.com/blog/youtube-integration-vs-dedicated-video-pricing/",
  rateYouTubeGaming: "https://influencerfee.com/blog/gaming-youtube-sponsorship-rates/",
  rateTwitch: "https://www.streamscheme.com/twitch-sponsorship-rate-card/",
  gdcCreativePartnerships: "https://gdcvault.com/play/1034317/Creative-Partnerships-A-Better-Way",
  gdcInfluencerReady: "https://gdcvault.com/play/1026587/Making-Your-Game-Influencer-Ready",
};

export const ARCHETYPES = {
  "sponsored-creator-wave": {
    name: "Sponsored creator wave",
    oneLiner: "A publisher pays many creators to post about the game in the same short window.",
    whatItIs:
      "The classic influencer media buy. A publisher (directly, or through an agency or marketplace) books a batch of YouTubers, TikTokers or streamers to cover the game in a set window, usually days, not weeks. Deals are typically a flat fee per deliverable: a 60 to 90 second read inside a normal video (an integration) or a whole video about the game (a dedicated video). Creators usually receive a brief with talking points, a link or code, and a posting date, which is why the posts arrive together and often sound alike.",
    howToSpot: [
      "Disclosure is high: many posts carry #ad, #sponsored, 'sponsored by', 'paid partnership', 'thanks to ... for sponsoring' or YouTube's 'Includes paid promotion' label.",
      "Synchronicity is high: many different creators post within roughly 24 to 72 hours of each other, often on the same day.",
      "Title similarity is high: titles reuse the brief's phrasing ('I tried X for the first time', 'Why everyone is playing X').",
      "Creator diversity is high and new-creator share is high: lots of channels that had not covered the game earlier in the window suddenly do.",
      "Engagement skew is low: views are spread fairly evenly across mid-size channels instead of one clip taking everything.",
      "Platform spread is moderate: mostly YouTube and Twitch, with creators cross-posting 'new video up' links to Bluesky, X or Mastodon.",
    ],
    whyStudiosDoIt:
      "It buys reach with an audience that trusts the creator more than an ad, and it can be timed to a moment (launch, sale, season). It is especially common for free-to-play and mobile games, where every install can be monetized later, so a publisher can keep buying as long as player value exceeds cost. RAID: Shadow Legends is the famous always-on example.",
    typicalCost:
      "No audited rate card exists. Agency and marketplace rate guides commonly quote gaming YouTube integrations at roughly $10 to $30 per thousand expected views (CPM), with a dedicated video costing about 2 to 3 times an integration from the same creator. Treat these as rough market chatter, not prices.",
    examples: [
      {
        game: "RAID: Shadow Legends",
        year: 2021,
        note: "Analytics firm BuzzGuru estimated Plarium spent about $8.66M promoting RAID through YouTube creators in six months of 2021, and that most of RAID's YouTube mentions in that period were sponsored.",
        sourceUrl: SRC.raidBuzzGuru,
      },
      {
        game: "RAID: Shadow Legends",
        year: 2020,
        note: "So many YouTubers ran RAID reads that the sponsorship itself became a meme.",
        sourceUrl: SRC.raidGamerant,
      },
      {
        game: "FragPunk",
        year: 2025,
        note: "Streams Charts found sponsored streams made up just over 20% of FragPunk's launch watch time, the highest share among 2025's top 20 launches it tracked.",
        sourceUrl: SRC.streamsChartsSponsored,
      },
    ],
  },

  "launch-blitz": {
    name: "Launch blitz",
    oneLiner: "Paid streams, press reviews and ads all fire at once around release day.",
    whatItIs:
      "A coordinated push timed to release. Review and preview embargoes lift at a set hour, so press and creators who got early copies publish together. Publishers often pay well-known streamers to play on day one or two, buy ads, and seed keys to hundreds of smaller creators. The goal is to own the conversation in the first days, when store algorithms, top-seller charts and Twitch's directory reward momentum.",
    howToSpot: [
      "Synchronicity is very high: a spike that starts at a round hour (the embargo lift) or on release day and spans press, YouTube and Twitch together.",
      "Platform spread is high: YouTube reviews, Twitch streams, Reddit threads and social posts all spike in the same 24 to 48 hours.",
      "Disclosure is mixed: paid streamers disclose, while reviewers who only got a free copy may say 'key provided by the publisher' or nothing.",
      "Creator diversity is high, and the new-creator share is high because many channels cover the game for the first time.",
      "Title similarity is moderate: 'review', 'first impressions', 'is it worth it' recur but are not word-for-word copies.",
      "Engagement skew is moderate: a few big channels lead, but many mid-size posts get decent views.",
    ],
    whyStudiosDoIt:
      "Launch week usually decides how a game is perceived, and many platforms rank by recent momentum. Concentrating spend makes the game look like the thing everyone is playing. Apex Legends is the textbook case: EA confirmed paid engagements with creators at launch instead of a long teaser campaign.",
    typicalCost:
      "Highly variable. In 2019 the Wall Street Journal, citing agents, reported streamers with 15,000+ concurrent viewers could earn $25,000 to $35,000 an hour on a launch day, and the very biggest up to $50,000. Reuters reported EA paid Ninja about $1M to promote Apex Legends' launch; EA did not confirm the figure.",
    examples: [
      {
        game: "Apex Legends",
        year: 2019,
        note: "Reuters reported EA paid Tyler 'Ninja' Blevins about $1M to stream and promote the game at launch; EA described 'paid engagements with some content creators' and declined to give terms.",
        sourceUrl: SRC.apexNinja,
      },
      {
        game: "(industry-wide)",
        year: 2019,
        note: "WSJ-sourced report: top streamers paid $25k to $35k per hour for launch-day streams, up to $50k for the biggest names.",
        sourceUrl: SRC.wsj50k,
      },
      {
        game: "Assassin's Creed Shadows",
        year: 2025,
        note: "Streams Charts counted over two million sponsored Hours Watched in its launch window, the most of any 2025 launch it tracked.",
        sourceUrl: SRC.streamsChartsSponsored,
      },
    ],
  },

  "trailer-reveal": {
    name: "Trailer or reveal spike",
    oneLiner: "A new trailer or showcase appearance sets off a burst of reaction videos and posts.",
    whatItIs:
      "Reveals happen at showcases (Summer Game Fest, The Game Awards, Nintendo Directs, PlayStation State of Play, Xbox shows) or as standalone drops. Publishers often pay for a slot in third-party shows and frequently promote the trailer itself with YouTube ads, which count toward its public view total. Reaction channels, news sites and forums then pile on within hours. The paid part is usually the slot and the ads, not the reactions.",
    howToSpot: [
      "Synchronicity is very high: posts cluster within hours of a single timestamp (the trailer premiere or showcase).",
      "Title similarity is high in a specific way: 'trailer', 'reveal', 'reaction', 'breakdown', 'everything we know'.",
      "Disclosure is low: reaction creators are usually not paid, so #ad and 'sponsored' are rare.",
      "Engagement skew is high: the official trailer upload takes most of the views; its count can include paid ad views.",
      "Platform spread is high: YouTube, Reddit, Bluesky and Mastodon all react the same evening.",
      "New-creator share is high: news and reaction channels that cover every reveal show up once and leave.",
    ],
    whyStudiosDoIt:
      "Showcases gather a huge, attentive audience at one moment, and a reveal is a cheap way to capture wishlists and press coverage. A trailer is also a reusable ad asset that can be promoted for months.",
    typicalCost:
      "Esquire, as reported by Kotaku, said a main-show Summer Game Fest 2024 slot started at $250,000 for one minute and rose to $550,000 for 2.5 minutes, with some trailers placed free as editorial picks. YouTube ad spend on top of that varies with targeting.",
    examples: [
      {
        game: "Summer Game Fest (showcase)",
        year: 2024,
        note: "Reported trailer pricing: $250k for one minute, $350k for 1.5 minutes, $450k for two, $550k for 2.5 minutes; some trailers ran at no cost as editorial placements.",
        sourceUrl: SRC.sgfKotaku,
      },
      {
        game: "(YouTube trailer ads)",
        year: 2017,
        note: "YouTube's own top game-trailer ads list mixed organic and paid views, so a trailer's headline view count does not equal organic interest.",
        sourceUrl: SRC.ytTopTrailerAds2017,
      },
      {
        game: "(YouTube view counting)",
        year: 2011,
        note: "TechCrunch showed most views on several movie trailers came from ads, because YouTube counted qualifying ad views as regular views.",
        sourceUrl: SRC.ytAdViews2011,
      },
    ],
  },

  "streamer-sponsorship": {
    name: "Sponsored streams",
    oneLiner: "Streamers are paid by the hour, or by viewer-hour, to play the game live.",
    whatItIs:
      "The live-video version of a sponsored integration. A publisher books streamers on Twitch, YouTube Live or Kick for a set number of hours, often with requirements like a title tag, a command in chat, a link panel or a minimum average viewership. Smaller streamers often join through self-serve marketplaces (for example StreamElements Sponsorships, which now appears inside the Twitch dashboard) and get paid per qualifying new player. Twitch Drops (in-game rewards for watching) are a related tool that pushes viewers toward streams of the game.",
    howToSpot: [
      "Disclosure shows in stream titles: '#ad', '#sponsored', 'sponsored by', or Twitch's branded content tag.",
      "Synchronicity is high: many channels go live with the game within the same day or campaign window.",
      "Title similarity is high: stream titles repeat a hashtag, a command ('!game', '!wishlist') or the same campaign phrasing.",
      "Engagement skew is low to moderate: viewer counts track each streamer's usual audience rather than one break-out.",
      "New-creator share is high and many streamers drop the game right after the campaign ends.",
      "Platform spread is low: mostly Twitch and YouTube Live, sometimes with matching VOD uploads.",
    ],
    whyStudiosDoIt:
      "Live streams show the game being played for hours, answer viewer questions in real time and can fill the game's directory page. For games that rely on watching (shooters, co-op, roguelikes) it is the most natural format.",
    typicalCost:
      "Rate-card sites commonly cite about $1 per average concurrent viewer per sponsored hour, with a $0.50 to $2.50 spread; these are not audited figures. Top-tier launch streams have been reported far higher (see Launch blitz).",
    examples: [
      {
        game: "(research study)",
        year: 2024,
        note: "Kellogg researchers estimated a median return on investment of -95% for sponsored Twitch streams, with about 16% of games seeing high positive returns; organic streams were about four times as effective at bringing in players.",
        sourceUrl: SRC.kellogg,
      },
      {
        game: "(StreamElements x Twitch)",
        year: 2025,
        note: "Twitch began surfacing StreamElements sponsorship offers in streamer dashboards; StreamElements says 100,000+ creators have completed campaigns.",
        sourceUrl: SRC.streamElements,
      },
      {
        game: "Apex Legends",
        year: 2019,
        note: "EA sponsored Twitch streamers, including Ninja and Shroud, for the first days after launch.",
        sourceUrl: SRC.apexNinja,
      },
    ],
  },

  "update-drop": {
    name: "Update, season or patch wave",
    oneLiner: "A new season, expansion or big patch pulls returning creators back to the game.",
    whatItIs:
      "Live-service games run on a calendar: seasons, battle passes, new characters, expansions, balance patches. Each drop gives existing creators fresh material (patch notes, tier lists, 'new meta' videos). Some publishers add paid pushes or creator incentive programs around each version. Genshin Impact, for example, has run per-version creator programs that reward streaming or uploading about the update.",
    howToSpot: [
      "New-creator share is low: the cluster is mostly creators who already covered the game earlier in the window.",
      "Title similarity is moderate: 'patch', 'season', 'update', 'tier list', 'meta', version numbers ('2.1', 'S4').",
      "Synchronicity is high around the update date, then decays over a week as guides roll out.",
      "Disclosure is low to moderate; it rises if the publisher ran a creator program or paid push.",
      "Creator diversity is moderate: dedicated channels for that game dominate.",
      "Platform spread is high on Reddit and Discord-adjacent communities, where patch notes are discussed.",
    ],
    whyStudiosDoIt:
      "Live games make money from players who keep coming back. Each update is a reactivation moment, and returning creators remind lapsed players to check in. It is much cheaper to re-engage an existing community than to buy new players.",
    typicalCost:
      "Often low: the creators are already invested. Incentive programs pay in prize pools or in-game currency. Genshin's 3.0 Twitch creator program, for example, advertised in-game rewards plus a $20,000 prize pool.",
    examples: [
      {
        game: "Genshin Impact",
        year: 2022,
        note: "The version 3.0 Twitch creator program asked registrants to stream a minimum number of hours and offered in-game currency and a $20,000 prize pool.",
        sourceUrl: SRC.genshinCreator30,
      },
      {
        game: "Palworld",
        year: 2026,
        note: "The 1.0 release, an update to an existing early-access game, drew more than 855,000 concurrent Steam players, according to GamesRadar.",
        sourceUrl: SRC.palworld10,
      },
    ],
  },

  "event-or-esports": {
    name: "Event or esports moment",
    oneLiner: "A tournament, in-game concert, convention or sponsorship deal creates a dated spike.",
    whatItIs:
      "Spikes tied to a scheduled event rather than to the game's release: esports finals, in-game live events, conventions, charity streams, or a brand sponsoring a team. Some are paid (jersey sponsorships, event fees), some are organic fandom. Game publishers both run events (to keep players engaged) and buy into other people's events (to reach those audiences).",
    howToSpot: [
      "Synchronicity is very high around a known date and time.",
      "Engagement skew is high: an official broadcast or VOD takes most of the views; clips and highlights follow.",
      "Title similarity is moderate: event names, team names, 'finals', 'live event', 'highlights'.",
      "Disclosure is low except for sponsor mentions ('presented by', 'brought to you by').",
      "Platform spread is high for big moments (clips everywhere), low for niche tournaments.",
      "New-creator share is moderate: event coverage brings in esports and news channels.",
    ],
    whyStudiosDoIt:
      "Events concentrate attention and give lapsed players a reason to return. For non-endemic or mobile publishers, esports sponsorship buys association with an audience that ignores ads. Digiday reports brand money in esports is increasingly following individual personalities rather than leagues.",
    typicalCost:
      "Rarely disclosed. Team sponsorships and in-game events are custom deals; treat any figure you see as a rumor unless a company confirmed it.",
    examples: [
      {
        game: "Fortnite",
        year: 2020,
        note: "Travis Scott's 'Astronomical' in-game concert drew 12.3 million concurrent players at its first showing, a record Epic announced.",
        sourceUrl: SRC.travisScott,
      },
      {
        game: "RAID: Shadow Legends",
        year: 2021,
        note: "Plarium sponsored esports team NAVI, with its logo on team jerseys and crossover content in the game.",
        sourceUrl: SRC.raidNavi,
      },
    ],
  },

  "organic-viral": {
    name: "Organic viral breakout",
    oneLiner: "Players and creators spread the game on their own, without a visible paid push.",
    whatItIs:
      "A game catches on because playing or watching it is fun to share: funny co-op moments, social deduction, emergent chaos, 'one more run' loops. One big streamer tries it, their peers follow, clips spread on Shorts and TikTok, and sales jump. The marketing team's job becomes keeping up (servers, patches, keys for creators) rather than buying attention. Publishers sometimes still help it along, so 'organic' means no visible paid push, not zero marketing.",
    howToSpot: [
      "Disclosure is near zero: almost no #ad or 'sponsored' language.",
      "Engagement skew is high: a handful of clips or streams get most of the views.",
      "Synchronicity is moderate and builds over days or weeks (a snowball) instead of a single paid day.",
      "Title similarity is low: titles are varied, personal and meme-driven.",
      "Creator diversity is high and new-creator share is high, and the creators keep coming back.",
      "Platform spread is high: Twitch, YouTube, Reddit and social posts all grow, often with memes.",
    ],
    whyStudiosDoIt:
      "It is not usually bought, but studios try to design for it: easy-to-stream co-op, short sessions, surprising moments, a demo or low price, and generous creator policies. Research suggests unpaid streams are more effective per stream than paid ones.",
    typicalCost: "Little or no media cost; the cost is in making a game worth sharing and in keeping servers up.",
    examples: [
      {
        game: "Among Us",
        year: 2020,
        note: "Released in 2018, it took off in mid-2020 after Korean streamers and then Sodapoppin played it; other big streamers followed.",
        sourceUrl: SRC.amongUsKotaku,
      },
      {
        game: "Palworld",
        year: 2024,
        note: "Passed 2 million concurrent Steam players within a week of early access, the second game ever to do so.",
        sourceUrl: SRC.palworldGamespot,
      },
      {
        game: "Helldivers 2",
        year: 2024,
        note: "Player counts more than doubled over launch weekend as the game went viral; the lead later said the team had prepared for about 150,000 peak concurrent users.",
        sourceUrl: SRC.helldiversPcGamer,
      },
      {
        game: "Lethal Company",
        year: 2023,
        note: "A solo-developer co-op horror game that dominated Twitch and YouTube; Game Developer reported an estimate of about 10 million copies sold (not confirmed by the developer).",
        sourceUrl: SRC.lethalGameDev,
      },
      {
        game: "Balatro",
        year: 2024,
        note: "Spread through streamers and word of mouth after a quiet start; GameDiscoverCo covered how it reached 1 million sales.",
        sourceUrl: SRC.balatroGameDiscover,
      },
    ],
  },

  controversy: {
    name: "Controversy wave",
    oneLiner: "A backlash, boycott or review-bombing episode drives a burst of posts.",
    whatItIs:
      "Attention driven by argument: pricing or monetization backlash, a policy change, a creator's or company's statements, performance problems, or culture-war fights. It often shows up as a burst of negative reviews on Steam (review bombing), angry Reddit threads and commentary videos. Controversy can coexist with very high interest; it is not the same thing as low sales.",
    howToSpot: [
      "Disclosure is near zero.",
      "Synchronicity is high and is triggered by news, not by a release or patch.",
      "Title similarity is moderate around charged words: 'boycott', 'refund', 'review bomb', 'backlash', 'scandal', 'DRM', 'controversy'.",
      "Creator diversity is high with many commentary and news channels that do not normally cover the game (high new-creator share).",
      "Engagement skew is high: a few commentary videos and Reddit threads draw most of the views and comments.",
      "Comment counts are high relative to likes or views (lots of arguing).",
    ],
    whyStudiosDoIt:
      "Studios do not want this archetype, but it matters for reading data: controversy can inflate every attention metric. Valve now detects anomalous review spikes and can exclude 'off-topic review bombs' from a game's Steam score.",
    typicalCost: "Not a buy. The cost shows up in refunds, review scores and community trust.",
    examples: [
      {
        game: "Hogwarts Legacy",
        year: 2023,
        note: "Despite boycott calls tied to J.K. Rowling's views on trans people, it set a Twitch record for a single-player game at its early-access launch.",
        sourceUrl: SRC.hogwartsTwitch,
      },
      {
        game: "(Steam platform)",
        year: 2019,
        note: "Valve began flagging anomalous review activity and removing confirmed off-topic review bombs from review scores, while keeping the reviews visible.",
        sourceUrl: SRC.steamReviewBombs,
      },
    ],
  },

  "background-chatter": {
    name: "Background chatter",
    oneLiner: "The steady baseline of players and fans talking about a game they play.",
    whatItIs:
      "Everyday posts: questions, builds, screenshots, small streams, reviews from regular players. It is the baseline every burst is measured against. A healthy game has a steady baseline; a burst only means something relative to it.",
    howToSpot: [
      "Synchronicity is low: posts are spread evenly across the window.",
      "Disclosure is near zero.",
      "Title similarity is low: varied questions and personal posts.",
      "Creator diversity is high but each creator posts rarely; new-creator share stays flat.",
      "Engagement skew is low to moderate: small numbers everywhere.",
      "Platform spread depends on the community: Reddit and Mastodon often lead.",
    ],
    whyStudiosDoIt:
      "Not a campaign. Studios cultivate it through community management, Discord, patch communication and fan creator programs, because a strong baseline is what paid bursts need to land on.",
    typicalCost: "No media cost; community management staff time.",
    examples: [
      {
        game: "Resident Evil Requiem",
        year: 2026,
        note: "The biggest H1 2026 launch on streaming platforms, yet sponsored streams were only 1.86% of its release-week Hours Watched, per Streams Charts. Most attention, even for big launches, is unpaid.",
        sourceUrl: SRC.streamsChartsH1_2026,
      },
    ],
  },
};

export const GLOSSARY = [
  { term: "Media buying", definition: "Paying for attention: buying ad space, sponsored creator content, showcase slots or placements, as opposed to earning coverage for free." },
  { term: "Paid, owned, earned media", definition: "Paid media is bought (ads, sponsorships). Owned media is your own channels (store page, trailer, Discord). Earned media is coverage you did not pay for (reviews, organic streams, word of mouth)." },
  { term: "CPM", definition: "Cost per mille: the price per 1,000 views or impressions. Creator deals are often quoted as a CPM times the creator's expected views." },
  { term: "CPV", definition: "Cost per view: the price paid for each view, common for YouTube ads where a view means watching a minimum length or interacting." },
  { term: "CPI", definition: "Cost per install: what it costs to acquire one install of a mobile game through ads. The core metric of mobile user acquisition." },
  { term: "CPA", definition: "Cost per action: paying only when a viewer does something specific, such as installing, creating an account or reaching a level." },
  { term: "Flat-fee sponsorship", definition: "A fixed price for an agreed deliverable (one video, one stream, one post), regardless of how it performs." },
  { term: "Integration", definition: "A sponsor segment inside a creator's normal video, often 30 to 90 seconds; cheaper than a dedicated video." },
  { term: "Dedicated video", definition: "A whole video about the sponsor's game; usually priced at several times an integration from the same creator." },
  { term: "Sponsored stream", definition: "A live stream where the creator is paid to play the game for a set time, often priced per hour or per concurrent viewer." },
  { term: "CCV (average concurrent viewers)", definition: "The average number of people watching a live stream at once. The main way streamers are sized and priced." },
  { term: "Hours watched", definition: "Total viewing time across all streams of a game; used to compare games' presence on Twitch and YouTube Live." },
  { term: "Rev share / affiliate", definition: "The creator earns a percentage of sales they drive, instead of or in addition to a fee. Epic's Support-A-Creator program pays 5% of qualifying purchases made with a creator's code." },
  { term: "Creator code", definition: "A code viewers enter at purchase to credit a creator; it attributes sales and pays the creator a share." },
  { term: "Key distribution", definition: "Sending free game keys to creators (directly or through platforms like Keymailer, Lurkit or Woovit) in the hope they cover the game. Coverage is not guaranteed and is not paid." },
  { term: "Twitch Drops", definition: "In-game rewards viewers earn by watching Drops-enabled streams of a game with linked accounts; a way to pull viewers to streams and players back to the game." },
  { term: "Embargo", definition: "An agreed time before which press and creators may not publish reviews or footage. Lifts make coverage arrive all at once." },
  { term: "Showcase", definition: "A broadcast of trailers and announcements (Summer Game Fest, The Game Awards, Nintendo Direct). Third-party shows may charge for slots." },
  { term: "UA (user acquisition)", definition: "Paid marketing aimed directly at getting new players, usually measured per install and against player value. Dominant in mobile." },
  { term: "ATT / IDFA", definition: "Apple's App Tracking Transparency (2021) asks users to allow tracking via the IDFA advertising ID; most decline, which made iOS ad targeting and attribution harder." },
  { term: "LTV", definition: "Lifetime value: how much a player is expected to spend over time. UA is profitable when LTV exceeds acquisition cost." },
  { term: "ROAS", definition: "Return on ad spend: revenue attributed to a campaign divided by its cost." },
  { term: "Wishlist", definition: "A Steam (or console store) save that notifies the player at launch or on sale. The main pre-launch demand signal for PC games." },
  { term: "Wishlist conversion", definition: "Sales in a period divided by wishlists at launch. GameDiscoverCo has reported a first-week median around 0.15 sales per wishlist for a recent cohort, with wide variation." },
  { term: "Attribution", definition: "Working out which marketing caused a sale or install. Hard for creator content because viewers often buy later, on another device or without a link." },
  { term: "View-through", definition: "Credit given to an ad or video when someone saw it and later converted without clicking. Useful but easy to over-claim." },
  { term: "Disclosure", definition: "Telling viewers clearly that content is paid or that the creator received something of value. Required by the FTC in the US and the ASA/CAP code in the UK." },
  { term: "Includes paid promotion", definition: "The label YouTube shows on videos where the creator ticked the paid promotion box in YouTube Studio. YouTube may also add it when its systems detect undisclosed branded content." },
  { term: "Branded content tool (Twitch)", definition: "Twitch's setting that marks a stream as including sponsored content; Twitch's Creator Camp tells creators to use it for sponsorships." },
  { term: "Review bombing", definition: "A sudden flood of negative user reviews, often about an issue outside the game itself. Steam can exclude confirmed off-topic review bombs from a game's score." },
  { term: "Organic", definition: "Attention nobody paid for: players and creators choosing to talk about a game." },
];

export const LESSONS = [
  {
    id: "what-is-media-buying",
    title: "1. What media buying means for games",
    body: [
      "Media buying is the part of marketing where you pay for attention. For a game that means ads (YouTube pre-rolls, social ads, app-store ads), creator sponsorships (paying a YouTuber or streamer to feature the game), and placements (a trailer slot in a showcase, a featured spot in a store).",
      "A useful split is paid, owned and earned. Paid is anything you buy. Owned is your channels: store page, trailer, Discord, social accounts. Earned is coverage you get for free: reviews, organic streams, memes. Most successful launches combine all three, and paid spending usually works best when it amplifies something people already want to share.",
      "Games lean on creators more than most products because watching someone play is a near-perfect preview. The research question is when paying them actually adds anything.",
    ],
    sources: [
      { title: "Kellogg Insight: Are sponsored streams worth it?", url: SRC.kellogg },
      { title: "Digiday: creators wield the most influence", url: "https://digiday.com/marketing/you-want-to-be-the-brand-as-games-become-a-driver-of-fandom-and-media-consumption-individual-creators-wield-the-most-influence/" },
    ],
  },
  {
    id: "creator-deal-menu",
    title: "2. The creator deal menu",
    body: [
      "Flat-fee deals are the default: a fixed price for an integration (a 30 to 90 second segment inside a normal video) or a dedicated video (the whole video is about your game). Streams are booked by the hour, often with a minimum average concurrent viewership.",
      "Performance deals pay per result: rev share or affiliate codes (Epic's Support-A-Creator pays 5% of purchases made with a creator's code), or per-install campaigns run through marketplaces such as StreamElements, which pays creators when new players install and play.",
      "Free-copy deals cost only keys: platforms like Keymailer, Lurkit and Woovit let creators request keys, and the developer chooses who gets one. No one is obliged to cover the game, so this is earned media with a small push. Game Developer has warned about paid 'discovery' services that cannot show real results.",
      "Platform tools: Twitch Drops reward viewers for watching Drops-enabled streams, and Twitch's branded content tool and YouTube's paid promotion checkbox label sponsored content.",
    ],
    sources: [
      { title: "Epic: Support-A-Creator vs Fortnite Developer programs", url: SRC.fortniteSac },
      { title: "StreamElements: sponsorship campaign compliance", url: SRC.streamElementsHelp },
      { title: "Keymailer FAQ", url: SRC.keymailerFaq },
      { title: "Game Developer: avoiding ineffective or scam influencer services", url: SRC.gamedevInfluencerScams },
      { title: "Twitch Drops technical guide", url: SRC.twitchDrops },
    ],
  },
  {
    id: "what-it-costs",
    title: "3. What it costs (and why the numbers are fuzzy)",
    body: [
      "There is no public price list. Most rate figures come from agencies and marketplaces with something to sell, so treat them as ranges. Commonly quoted: gaming YouTube integrations at roughly $10 to $30 per thousand expected views, dedicated videos at about 2 to 3 times an integration, and Twitch sponsored streams around $1 per average concurrent viewer per hour.",
      "The top end is different. In 2019 the Wall Street Journal reported streamers with 15,000+ concurrent viewers earning $25,000 to $35,000 an hour on launch days, and Reuters reported EA paid Ninja about $1M for Apex Legends' launch (unconfirmed by EA).",
      "Placements cost too: Summer Game Fest 2024 main-show trailer slots were reported at $250,000 for one minute up to $550,000 for 2.5 minutes.",
      "Digiday has reported big multi-million creator contracts drying up, with money shifting to smaller and mid-size creators, which matches the 'many mid-size channels at once' pattern Buzz Radar looks for.",
    ],
    sources: [
      { title: "Influencerfee: integration vs dedicated pricing (agency guide)", url: SRC.rateYouTube },
      { title: "StreamScheme: Twitch sponsorship rate card (rate guide)", url: SRC.rateTwitch },
      { title: "Kotaku: top streamers said to earn $50,000 an hour", url: SRC.wsj50k },
      { title: "PC Gamer: Ninja's Apex launch stream reportedly cost $1M", url: SRC.apexNinja },
      { title: "Kotaku: Summer Game Fest trailer prices", url: SRC.sgfKotaku },
      { title: "Digiday: big contracts dry up for top gaming creators", url: SRC.digidayMidTier },
    ],
  },
  {
    id: "timing",
    title: "4. Timing: reveal, build-up, embargo, launch, seasons",
    body: [
      "A typical premium game runs a sequence: reveal (often at a showcase), months of wishlist building (demos, festivals such as Steam Next Fest, creator previews), a preview or review embargo that lifts at a set hour, then a launch blitz of paid streams and ads in the first days.",
      "Embargoes are why coverage arrives in a wall: everyone with an early copy is allowed to publish at the same moment. Synchronized timing on its own is therefore not proof of payment.",
      "Live-service games then run on a calendar of seasons and patches. Each drop pulls returning creators back, and some publishers run creator incentive programs per version.",
      "Apex Legends showed the extreme version: a surprise reveal and launch on the same day, backed by paid streams in the first two days.",
    ],
    sources: [
      { title: "Kotaku: how video game review restrictions work", url: SRC.embargoKotaku },
      { title: "How To Market A Game: Next Fest wishlists", url: SRC.nextFestZukowski },
      { title: "PC Gamer: Apex Legends paid launch streams", url: SRC.apexNinja },
      { title: "Genshin Impact 3.0 creator program", url: SRC.genshinCreator30 },
    ],
  },
  {
    id: "mobile-vs-pc",
    title: "5. Mobile UA vs PC and console wishlists",
    body: [
      "Mobile free-to-play games are bought player by player. Publishers run user acquisition (UA) campaigns on ad networks and measure cost per install against expected lifetime value. As long as a player is worth more than they cost, they keep buying. That is why games like RAID: Shadow Legends can sponsor creators for years.",
      "Apple's App Tracking Transparency (2021) made this harder on iOS: most users decline tracking, so targeting and attribution got worse. Moloco reported iOS cost per install for core games rose 78% in the months after iOS 14.6, while casual games got cheaper.",
      "PC and console premium games are sold once, so the pre-launch goal is wishlists and follows that turn into launch-week sales. GameDiscoverCo found a recent median of about 0.15 first-week sales per wishlist, with very wide variation, so wishlists are a demand signal, not a guarantee.",
    ],
    sources: [
      { title: "Moloco: post-iOS 14.6 costs for casual vs core games", url: SRC.attMoloco },
      { title: "AdExchanger: UA for game developers after ATT", url: SRC.attAdExchanger },
      { title: "GameDiscoverCo: state of Steam wishlist conversions", url: SRC.wishlistConversion },
      { title: "Game World Observer: Plarium's YouTube spend on RAID", url: SRC.raidBuzzGuru },
    ],
  },
  {
    id: "organic-and-controversy",
    title: "6. What money cannot buy: viral hits and backlash",
    body: [
      "Some of the biggest spikes are not bought. Among Us came out in 2018 and exploded in 2020 after streamers picked it up. Palworld passed 2 million concurrent Steam players in its first week. Helldivers 2's team said it had prepared for about 150,000 peak players. Balatro spread through streamers and word of mouth.",
      "The pattern is a snowball: one notable creator plays, peers follow, clips spread, and the curve builds over days rather than appearing on one paid date. Views concentrate in a few clips.",
      "Controversy is the other unpaid driver. Hogwarts Legacy set a Twitch record despite boycott calls. Review bombs on Steam are common enough that Valve built detection for them. For analysis, controversy can inflate every attention metric without saying much about whether people like the game.",
    ],
    sources: [
      { title: "Kotaku: Among Us's improbable rise", url: SRC.amongUsKotaku },
      { title: "GameSpot: Palworld passes 2 million concurrent players", url: SRC.palworldGamespot },
      { title: "GamesRadar: Helldivers 2 prepared for 150,000 CCU", url: SRC.helldiversPrepared },
      { title: "PC Gamer: how Playstack found Balatro", url: SRC.balatroPcGamer },
      { title: "GamesRadar: Hogwarts Legacy Twitch record", url: SRC.hogwartsTwitch },
      { title: "PC Gamer: Valve acts on review bombs", url: SRC.steamReviewBombs },
    ],
  },
  {
    id: "disclosure",
    title: "7. Disclosure rules and labels",
    body: [
      "In the US, the FTC's Endorsement Guides require creators to disclose any material connection to a brand: payment, free products, or a family or business relationship. The FTC's 'Disclosures 101' guide says to put the disclosure with the endorsement (not only in a profile or buried in a description), to use plain words such as 'advertisement', 'ad' or 'sponsored', and to repeat it periodically during live streams. Platform tools may not be enough on their own.",
      "In the UK, the ASA expects influencer ads to be obviously identifiable, usually with a prominent 'Ad' label up front, and both the brand and the creator are responsible.",
      "Platforms add their own labels: YouTube shows 'Includes paid promotion' when creators tick the box in YouTube Studio and may add it automatically, and Twitch tells creators to use its branded content tool.",
      "For Buzz Radar this means disclosure language is the strongest public signal of a paid push, but it is incomplete: not everyone discloses, and a free review copy may be disclosed with different words.",
    ],
    sources: [
      { title: "FTC: Disclosures 101 for social media influencers", url: SRC.ftcInfluencers },
      { title: "FTC: Endorsement Guides FAQ", url: SRC.ftcFaq },
      { title: "ASA: recognising ads on social media", url: SRC.asaRecognising },
      { title: "YouTube Help: paid product placements and endorsements", url: SRC.ytPaidPromo },
      { title: "Twitch Creator Camp: sponsorships", url: SRC.twitchSponsorships },
    ],
  },
  {
    id: "measuring",
    title: "8. Measuring results and the attribution problem",
    body: [
      "Publishers watch wishlists and follows (PC), installs and cost per install (mobile), concurrent players, Twitch hours watched and average concurrent viewers, and view counts. Codes and tracked links help, but most viewers buy later, elsewhere, or after seeing several creators, so most creator impact is never directly attributed.",
      "Independent research is sobering. A Kellogg School study of Twitch found a median return on investment of -95% for sponsored streams; about 16% of games did well, mostly lesser-known or critically acclaimed ones. Organic streams were about four times as effective as sponsored ones at bringing in players.",
      "View counts can mislead too: YouTube has counted qualifying ad views on public view totals, so a trailer's big number can be partly bought.",
    ],
    sources: [
      { title: "Kellogg Insight: sponsored streams study", url: SRC.kellogg },
      { title: "TechCrunch: YouTube counts video ads as regular views", url: SRC.ytAdViews2011 },
      { title: "Google Ads Help: about video views", url: SRC.googleVideoViews },
      { title: "GameDiscoverCo: wishlist conversions", url: SRC.wishlistConversion },
    ],
  },
  {
    id: "read-a-timeline",
    title: "9. Reading a game's content timeline like an analyst",
    body: [
      "Start with the baseline: how many posts per day does the game get when nothing is happening? Then look for bursts that clearly rise above it.",
      "For each burst ask five questions. When did it start (a round hour suggests an embargo or premiere)? Who posted (many first-time creators or regulars)? What did titles say (copy-paste phrasing suggests a brief)? Did posts disclose payment? Where did the views go (spread evenly suggests a buy, concentrated in a few clips suggests virality)?",
      "Buzz Radar turns those questions into signals: disclosure, synchronicity, title similarity, creator diversity, new-creator share, platform spread and engagement skew. A paid creator wave usually scores high on the first five and low on skew. An organic hit scores low on disclosure and high on skew.",
      "Hold conclusions loosely. Embargoes and showcases also synchronize creators, undisclosed deals exist, and the app only sees what public APIs return. Use the score to pick which clusters to investigate, then open the posts and read them.",
    ],
    sources: [
      { title: "Streams Charts: sponsored streams in gaming", url: SRC.streamsChartsSponsored },
      { title: "GDC Vault: Creative Partnerships, a better way to influencer marketing", url: SRC.gdcCreativePartnerships },
      { title: "GDC Vault: Making your game influencer ready", url: SRC.gdcInfluencerReady },
    ],
  },
];

// Regex sources for disclosure language. Compile with new RegExp(pattern, flags).
// They are written to avoid common false positives: "#adventure", "add",
// "Twitch affiliate", "source code", "looking for partners".
export const DISCLOSURE_PATTERNS = [
  { pattern: "(?:^|[^\\w#])#(?:ad|ads|advert|advertisement|advertising|paidad)(?!\\w)", flags: "i", label: "#ad hashtag" },
  { pattern: "(?:^|[^\\w#])#(?:sponsored|sponsor|sponsorship|sponsoredpost|sponsoredcontent|spon)(?!\\w)", flags: "i", label: "#sponsored hashtag" },
  { pattern: "(?:^|[^\\w#])#(?!twitch|youtube|kick)(?:\\w*partner|\\w*partnership|paidpromotion)(?!\\w)", flags: "i", label: "#partner hashtag" },
  { pattern: "(?:^\\s*|[\\[(|]\\s*)(?:ad|advert|advertisement|sponsored|sponsor)\\s*(?:[\\])|:]|-\\s)", flags: "i", label: "Ad / Sponsored label" },
  { pattern: "(?<!\\bnot )(?<!\\bnever )(?<!\\bisn't )(?<!\\bwasn't )\\bsponsor(?:ed|ing)? by\\b", flags: "i", label: "sponsored by" },
  { pattern: "\\b(?:this|today'?s|the) (?:video|stream|episode|content|post|segment|vod)(?: is| was)?(?: (?:proudly|kindly|generously))? sponsored\\b", flags: "i", label: "this video is sponsored" },
  { pattern: "\\bthanks? (?:you )?(?:so much )?to [^.!?\\n]{1,60}? for (?:sponsoring|partnering)\\b", flags: "i", label: "thanks to X for sponsoring" },
  { pattern: "\\bfor sponsoring (?:this|today'?s|the|my) (?:video|stream|episode|content|channel)\\b", flags: "i", label: "for sponsoring this video" },
  { pattern: "(?<!\\bno )(?<!\\bnot )(?<!\\bnot a )(?<!\\bnon-)\\bpaid (?:partnership|promotion|sponsorship|collab(?:oration)?|endorsement)\\b", flags: "i", label: "paid partnership / promotion" },
  { pattern: "\\bin (?:paid )?partnership with\\b", flags: "i", label: "in partnership with" },
  { pattern: "\\bbrought to you by\\b", flags: "i", label: "brought to you by" },
  { pattern: "\\b(?:creator|promo|discount|affiliate|referral|partner) code\\b", flags: "i", label: "creator / promo code" },
  { pattern: "\\b(?:use|enter) (?:my )?code:? [a-z0-9_-]{3,20} (?:for|at checkout|to get|to save)\\b[^.\\n]{0,40}?(?:%|\\boff\\b|\\bfree\\b|discount|bonus|reward)", flags: "i", label: "use code X for a discount" },
  { pattern: "\\bsupport[- ]a[- ]creator\\b", flags: "i", label: "Support-A-Creator" },
  { pattern: "\\baffiliate links?\\b", flags: "i", label: "affiliate link" },
  { pattern: "\\bbrand (?:ambassador|partner|deal)\\b", flags: "i", label: "brand ambassador / partner" },
  { pattern: "\\b(?:key|copy|game|access) (?:was |were )?(?:provided|supplied|gifted|sent) by\\b", flags: "i", label: "key provided by" },
  { pattern: "\\b(?:review|press|preview) (?:copy|key|build)\\b", flags: "i", label: "review copy" },
  { pattern: "\\bthanks? (?:you )?to [^.!?\\n]{1,60}? for (?:the )?(?:early access|review copy|key|copy of the game|invite)\\b", flags: "i", label: "thanks for the key / early access" },
  { pattern: "(?:^|[^\\w#])#gifted(?!\\w)", flags: "i", label: "#gifted" },
];
