/**
 * NEWS newspaper (demo / local; was COMMUNE paper).
 *
 * Read-only AI newspaper: feed (news + social conglomeration) by edition.
 * Town Square / Correspondents are display-only (no user compose).
 *
 * localStorage keys (demo):
 *   cognation.commune.edition.v1
 *   cognation.commune.profile.v1
 *   cognation.commune.feed.v1
 *
 * Stores are API-ready: swap load/save for fetch later.
 */
(function () {
  "use strict";

  var EDITION_KEY = "cognation.commune.edition.v1";
  var PROFILE_KEY = "cognation.commune.profile.v1";
  var FEED_KEY = "cognation.commune.feed.v1";
  var FEED_ENDLESS_KEY = "cognation.commune.feedEndless.v1";
  var MEMBER_COUNTRY_KEY = "cognation.member.country.v1";

  function getMemberCountry() {
    try {
      return localStorage.getItem(MEMBER_COUNTRY_KEY) || "United States";
    } catch (e) {
      return "United States";
    }
  }

  function setMemberCountry(country) {
    try {
      localStorage.setItem(MEMBER_COUNTRY_KEY, country || "United States");
    } catch (e) {}
  }

  window.CognationMemberCountry = { get: getMemberCountry, set: setMemberCountry };
  var FEED_SEED_REV = 5; /* refresh international broadsheet wire */

  var EDITIONS = {
    local: {
      id: "local",
      label: "Local",
      subtitle: "Local Broadsheet · From Tower",
      dateline: "Local edition · Pin / neighborhood",
      volume: "Vol. I · No. 1",
      dek: "Most reacted posts from personal and professional Towers. Age-appropriate Tower content only.",
      topicsLeft: ["Neighborhood notes", "Block watch", "Market square", "School board"],
      topicsRight: [
        "TOWER — street level",
        "WELL — local spring",
        { text: "Grok Bot desk", href: "https://x.ai/bot" }
      ],
      seedPosts: [
        {
          id: "seed-local-1",
          authorName: "City Desk",
          kind: "news",
          source: "Local council wire",
          body: "COUNCIL WRAP — Zoning map redraw delayed to Thursday. Public comment window stays open online through midnight.",
          createdAt: "2026-09-15T18:00:00.000Z",
          seeded: true
        },
        {
          id: "seed-local-2",
          authorName: "@market_square",
          kind: "social",
          source: "Social",
          body: "Line for the peach stand hit the fountain again. Fiddle optional, cash preferred.",
          createdAt: "2026-09-15T17:20:00.000Z",
          seeded: true
        },
        {
          id: "seed-local-3",
          authorName: "Neighborhood Notes",
          kind: "news",
          source: "Community roundup",
          body: "Library east wing late hours continue this week. Map room is the quietest seat in the building.",
          createdAt: "2026-09-15T16:45:00.000Z",
          seeded: true
        },
        {
          id: "seed-local-4",
          authorName: "@blockwatch_n4",
          kind: "social",
          source: "Social",
          body: "Cedar Street pothole finally filled. Cones staged like a pop-up gallery.",
          createdAt: "2026-09-15T15:10:00.000Z",
          seeded: true
        }
      ]
    },
    statewide: {
      id: "statewide",
      label: "Statewide",
      subtitle: "Statewide Broadsheet",
      dateline: "Statewide edition · Member region",
      volume: "Vol. I · No. 12",
      dek: "Statewide hits — most-liked Tower topics chosen by News AI, written with @friends and @statewide links. Read-only.",
      topicsLeft: ["Capitol brief", "County lines", "Transit corridor", "Ag report"],
      topicsRight: [
        "TOWER — state outlook",
        "WELL — regional depth",
        { text: "Grok Bot desk", href: "https://x.ai/bot" }
      ],
      seedPosts: [
        {
          id: "seed-state-1",
          authorName: "State Desk",
          body: "Statewide edition online: roads, rivers, and the long view between cities.",
          createdAt: "2026-09-13T10:00:00.000Z",
          seeded: true
        },
        {
          id: "seed-state-2",
          authorName: "Jordan Lee",
          body: "Assembly vote delayed; correspondents advise checking the evening wrap.",
          createdAt: "2026-09-13T16:45:00.000Z",
          seeded: true
        }
      ]
    },
    nationwide: {
      id: "nationwide",
      label: "Nationwide",
      subtitle: "Nationwide Broadsheet",
      dateline: "Nationwide edition · Member country",
      volume: "Vol. II · No. 4",
      dek: "Same broadsheet look — what’s happening in the member’s country (United States default), drawn from Google News–style national sources. Read-only.",
      topicsLeft: ["National wire", "Markets open", "Science page", "Arts & letters"],
      topicsRight: [
        "TOWER — national scaffold",
        "WELL — deep brief",
        { text: "Grok Bot desk", href: "https://x.ai/bot" }
      ],
      seedPosts: [
        {
          id: "seed-us-nat-1",
          authorName: "National Desk",
          kind: "news",
          source: "Google News · US",
          body: "NATIONAL ROUNDUP — Markets, weather, and Capitol wires lead the United States plate this hour. Sources aggregated in Google News–style national coverage.",
          createdAt: "2026-09-16T02:00:00.000Z",
          seeded: true
        },
        {
          id: "seed-us-nat-2",
          authorName: "Wire Service",
          kind: "news",
          source: "Google News · US",
          body: "TRANSPORT & STORMS — National carriers and coastal forecasts dominate regional briefs inside the US edition.",
          createdAt: "2026-09-16T01:30:00.000Z",
          seeded: true
        },
        {
          id: "seed-us-nat-3",
          authorName: "Politics Desk",
          kind: "news",
          source: "Google News · US",
          body: "CAPITOL BRIEF — Overnight filings and committee calendars shape the nationwide politics column for US members.",
          createdAt: "2026-09-16T01:00:00.000Z",
          seeded: true
        },
      ]
    },
    international: {
      id: "international",
      label: "International",
      subtitle: "International Newspaper",
      dateline: "International edition · Oct 2, 2026",
      volume: "Vol. III · No. 3",
      dek: "Spain housing turmoil leads Europe; Yemen and Ukraine war desks track escalation and shipping risk.",
      topicsLeft: ["World desk", "Diplomacy", "Trade winds", "Culture abroad"],
      topicsRight: [
        "TOWER — global frame",
        "WELL — deep currents",
        { text: "Grok Bot desk", href: "https://x.ai/bot" }
      ],
      seedPosts: [
        {
          id: "intl-2026-10-02-spain-housing",
          authorName: "Cognation Wire",
          body: "BREAKING | Spain / Europe\nMADRID HOUSING DECREES FAIL IN PARLIAMENT; EARLY ELECTION TALK RISES\n\nSpain\u2019s government lost a parliamentary vote on housing measures, dealing a blow to the governing coalition. Opposition and analysts floated the prospect of early elections as protests over housing costs continue.\n\nSources: AP News https://news.google.com/rss/articles/CBMilwFBVV95cUxPSER5andpMFpUc19KTEg1M2RoOHZqSmdrd2FzN2Z5dmQ3WUdhRzgySzlvTGdiSS1YQWgyMk45QkFNcmNlRDBLSnVwZ1UtVGs5TnVBQ1Z1dnpuU2RHM25YVmduY1NObTRhLUtYSUt5VDZVX2ZWRGxoU0h5d0pDNVI4dHRKLXBMb1NYVFRZazhNUXE3VWEzVEdn?oc=5 ; Al Jazeera https://news.google.com/rss/articles/CBMiqgFBVV95cUxQSWxIVW1aQlpRM3M5QnRvaUYtLXpVVXNRSDlaOVMySDR6bmVjd09EendWNEF2UTRlZEhuNDlUS2hlSjdTcnR3SEtnSHdBVnVpaU45Qm1lZXVpN2k3alJiYW9WNDJSRGM5XzJQQUJ3ZmxKZ2xOdGk4TjdCUXBodFFIOVA2YmZHRFVleUkxR0I0cVh5emtrRXlMSXcwSE9TdFEyRnBjZU50VVJUQdIBrwFBVV95cUxOUnNiUFRIaHFJeUh4T1V0UlY0dnZnbEo4aFgtV09STzA4TVBMOU9Ub19heU0xbmJfVnd4bUhOdUZYZ2pPSFhIQTVJTExTTkZxNTlLNUpxZjZBYXpOb1Zmb1dBUi1nWVU0c1dPNmExWUVSdkNiU2k1djZTY01XNVI5OEZ5dFItOXU2MklldWxPZXlwamZuN2tYYlpQeVRFNFMxTWp0b1BRcVY2RmJlWmxF?oc=5",
          createdAt: "2026-10-02T20:00:00.000Z",
          seeded: true
        },
        {
          id: "intl-2026-10-02-france-schools",
          authorName: "Cognation Wire",
          body: "BREAKING | France / Europe\nNEARLY 400 FRENCH SCHOOLS CLOSED AS STUDENT PROTESTS CONTINUE\n\nFrance reported about 400 schools shut while student demonstrations persisted, disrupting classes and transit corridors tied to education and youth protest routes.\n\nSource: DW https://news.google.com/rss/articles/CBMikAFBVV95cUxOb2RYdlBlLVVIVXpHU2JkRXVCXzFlVVQ1N0k0aDBNNzREN0M1Sm5DTVFxRlJFZTU4OTFJQ0p4aWZaMm1pRHpTSUZXQ0RYUE1jSmQxWl9oM0twYlkwNDV5dDQwekI4TFUtSG9samU5aDMwTTRiQVlUcDAyUThpeGdaYVI1TE5vREtlUGd0REdCTWrSAZABQVVfeXFMTU5RYWEyc3pLZjhFRTQyRWUyY3EyNkwzU2x2MjRSVnBjTGU4ZThrQjRoTUxWa2RMMy1BU2FRbEFVamhYZGxZMDFXeDlXS1N3V3ZuODZTNi1BUHdwS05sdXdLS1VtVlJQSzY4eVRCN0diOTd0cENBWEdVT0N5UHVfU2FzT3JoWnZ2SnRFa1pWLU0x?oc=5",
          createdAt: "2026-10-02T19:45:00.000Z",
          seeded: true
        },
        {
          id: "intl-2026-10-02-germany-merz",
          authorName: "Cognation Wire",
          body: "BREAKING | Germany / Europe\nREFORM ROW RAISES FEARS FOR MERZ COALITION\n\nA domestic reform dispute in Berlin is feeding speculation about strain inside Chancellor Merz\u2019s governing coalition, with opposition parties pressing the rift.\n\nSource: DW https://news.google.com/rss/articles/CBMilwFBVV95cUxPaTNhMGs2NWRlaGNUaUU1QnB4QVFONTBfME9uOV9MeUl1QU04Q1NpQjBQeTRZT1NrMTR5U280NnBJTl8xNVBxaUpTUWs1SFllajh4bFk5VkRQZVZZVEJsQ0JOdVBWQnpZNldiQl9xd0ZIc2pVaGE4allRUVFLSEZ0Y0hUdlFXM3BTSDVjTHZLZzFuWS1sRXdN?oc=5",
          createdAt: "2026-10-02T19:30:00.000Z",
          seeded: true
        },
        {
          id: "intl-2026-10-02-eu-return-hubs",
          authorName: "Cognation Wire",
          body: "BREAKING | European Union / Migration\nEU APPROVES MIGRANT \u2018RETURN HUBS\u2019; FIVE STATES EYE THIRD-COUNTRY DEPORTATIONS\n\nThe EU moved ahead on migrant \u201creturn hubs\u201d while five European governments sketched plans for third-country deportations in parallel with U.S. policy shifts, according to CBS News.\n\nSource: CBS News https://news.google.com/rss/articles/CBMilwFBVV95cUxNM1FyMjBtTmxlclZmVWF0TzloVVZYOXBfRnNXMy16bldyMG5uei1yN0R2V0I3TGR4elhRenNkNDY4cEJ2REctYV9ORjVZTTlTb3FJcXBoN1JXSkxJdUxBM2ZUb25OZTBxV3pNYmlUMS1jQS01QlNJMWtVS1B5SmN3YmZtMjc3Q2VmSGl6cmVuYW9OR1ljaGI4?oc=5",
          createdAt: "2026-10-02T19:15:00.000Z",
          seeded: true
        },
        {
          id: "intl-2026-10-02-yemen-fighting",
          authorName: "Cognation Wire",
          body: "BREAKING | Yemen / Middle East\nFIGHTING INTENSIFIES IN YEMEN; FEARS OF WIDER WAR RISE\n\nClashes inside Yemen sharpened, raising fresh warnings of an all-out escalation that could again stress Red Sea shipping lanes.\n\nSource: The New York Times https://news.google.com/rss/articles/CBMimgFBVV95cUxNTmlxQjEtWS04S2hkc2t4a3VKRWxSZUg1SVl2ZE80ZTN2eUdDUTVPTEZPWmJUYWRhMVAySW1JMEcyaUNPRHpDdkZyTTU1YXRWcG05eGU1aUJWeUNCck1PTjNZZHVjUkFrb2FsNGRlSGN1SkxTZ0Z6aWdZLVp3Mm0tQ0ZPV2VMeHE1NVM4Rkc3ZmMtTnFjX201QTFB?oc=5",
          createdAt: "2026-10-02T19:00:00.000Z",
          seeded: true
        },
        {
          id: "intl-2026-10-02-ukraine-missile",
          authorName: "Cognation Wire",
          body: "BREAKING | Ukraine / Europe\nKYIV REPORTS FIRST COMBAT USE OF ITS OWN BALLISTIC MISSILE\n\nUkraine said it used a domestically built ballistic missile in combat for the first time, a claimed capability leap as the wider energy-and-strike war continues.\n\nSource: The New York Times https://news.google.com/rss/articles/CBMiiwFBVV95cUxNTGlPdENnRW43dXFyd0x2ZlcwSnVLMVNkNFl3MEhzR2tPYjY1VGpLdUIyZjAxZzNpeFY5SEhIRmllMmdGRXdVRnBobVJ4bmRCT28xM29iSDBfRUZOa2owTFk2UGRnLTlZcnFkbW1JWFd3ZkFFa2ZKLXlVMnlrM0RBdjFJOXQ1WjVyNFRF?oc=5",
          createdAt: "2026-10-02T18:45:00.000Z",
          seeded: true
        },
        {
          id: "intl-2026-10-02-ethiopia-tigray",
          authorName: "Cognation Wire",
          body: "BREAKING | Ethiopia / Horn of Africa\nETHIOPIAN FORCES NEAR TIGRAY CAPITAL; WIDER-CONFLICT FEARS GROW\n\nReuters reported federal forces advancing toward the Tigray capital, reigniting concern that the northern conflict could widen again.\n\nSource: Reuters https://news.google.com/rss/articles/CBMisAFBVV95cUxQazJuWGtHMHMwR1AxYjFvenY0NHFFN2VsemM3QU9LSVRkdldKd3ZyUzNtWUVIR2QtQ1E3NG9ZYm80Z2JYTktIa044ekltWVpKQzJMS3Y3Z0o4eUpqUzFZRWNLa0pZM3JfQzFCbDhhM1NUUEVrSk9OVWJTOVpPTDJHNF9qb2JadUN1Ym1UZmkyMWJmQ0U5QTdQNlBDWlltRlREYk51WTNyTzU3aC02OWNpSg?oc=5",
          createdAt: "2026-10-02T18:30:00.000Z",
          seeded: true
        },
        {
          id: "intl-2026-10-02-brazil-amazon",
          authorName: "Cognation Wire",
          body: "EVERGREEN | Brazil / Americas\nLULA\u2013BOLSONARO SHOWDOWN RETURNS \u2014 WITH THE AMAZON AT STAKE\n\nBrazil\u2019s political duel between Lula and Bolsonaro camps is again framed around Amazon policy and U.S. attention under Trump, Axios reports.\n\nSource: Axios https://news.google.com/rss/articles/CBMiiwFBVV95cUxNTGFPazNuWTRHcW5lMEYyZS1XUVNITUh6VjlQMzlZRmxFNjFUd1Y5RXF4VmxvNWVQd2JsaVpoakVXeml0VF9JejM0QWltSUg1YWxRb1JyQlpCS2Q0ZGdScGFuZTBJWGxxVTZCbXN1czNwRTYwaWNNeHFtT09rVVA2b245d3Fkck5ZVWVv?oc=5",
          createdAt: "2026-10-02T18:15:00.000Z",
          seeded: true
        },
        {
          id: "intl-2026-10-02-uk-raf-plot",
          authorName: "Cognation Wire",
          body: "BREAKING | United Kingdom / Security\nUK ARRESTS BRITISH-IRANIAN SUSPECT OVER ALLEGED RAF PLOT\n\nBritish authorities arrested a British-Iranian suspect in connection with an alleged plot involving the RAF; Al Jazeera summarized what is publicly known so far.\n\nSource: Al Jazeera https://news.google.com/rss/articles/CBMipAFBVV95cUxOdXlxMzFuZ1htdmVRUUd0a2VqZTR5c1dGN2o0ZmtHYWJ1eFhacS1faTlPbXd5VVhJVkM3eFdPN2FGbFdaNFFySEJjSGpHWU1qTGFuaWNLNFhFTkNmZzFPeFZTUlc4SmtCX0NBQWlFa0ZobkJ0VjZENEtUeDROSmxibW95a1VSZ1kzaVZWQkZVQzlVWjRUVWI1YXU1UHM1VGJFdzlRNdIBqgFBVV95cUxPV24yTFZWU1VGNVZzdHp3TEJtZDlVVzZveUpnTlJOcWJTMkFuZWxyMlRIT1Rkbjl5YlJMcEhkQk96X3RiNlBWUXFXbURoUDVUUFVfckVudnc1TGNKVmRzeGJDcDRpWV9acm9ta2lfc2pVNF90Vi1Selp3eFZRNVZpME1qY0RpSGN2QnRxb0o5SHlwemFuV052SzlwczlweDM3REExVS1ZS2NOdw?oc=5",
          createdAt: "2026-10-02T18:00:00.000Z",
          seeded: true
        },
        {
          id: "intl-2026-10-02-seasia-democracy",
          authorName: "Cognation Wire",
          body: "EVERGREEN | Southeast Asia\nPRO-DEMOCRACY ACTIVISTS FACE RISING CROSS-BORDER PRESSURE\n\nNPR reports pro-democracy organizers across Southeast Asia are increasingly exposed to authoritarian governments\u2019 reach beyond their home borders.\n\nSource: NPR https://news.google.com/rss/articles/CBMingFBVV95cUxNbmlyVkJNX0dlS081c3ZlUE5lZWJXblJaT2RtblR6Q3c4Rm8xenYtZTF2NlV1RjlKeXkxbmUtU1VXVk1VYlVaM253ZEd4eFROZFhoRVJGTmZNaWRmaFV1YURuMmJSdkpGUVdrMjIwSjBOdlUyODA4TW9NTFVSTS1ud2hkYUg5d0V3OGd3T2dTX3ozLWoxLXBjRUVBYWVqZw?oc=5",
          createdAt: "2026-10-02T17:45:00.000Z",
          seeded: true
        },
        {
          id: "intl-2026-10-02-pacific-whale",
          authorName: "Cognation Wire",
          body: "EVERGREEN | South Pacific\nWHALE SINKS YACHT; SAILORS RESCUED ALIVE AFTER 18 HOURS\n\nA whale strike sank a yacht in the South Pacific; crew were rescued alive about 18 hours later, CBS News reported.\n\nSource: CBS News https://news.google.com/rss/articles/CBMikwFBVV95cUxPdUNmc3FEWlVidzZMaFZxVkpaRDA2d0JyeEl4UG9uMXl3ZFRNamU5MzE2d0E5YmVvMmRaN3FHTzRhb0tLNGI2QWczX0N6ckpPc1dlRFRxVXFEYUV2d1h5a0xOMHh0SlBpTEM4dGg3N21JUjZrX3FobHozZjJIT2NiczZsb2tsLWpUZVNNalMwQVBodVE?oc=5",
          createdAt: "2026-10-02T17:30:00.000Z",
          seeded: true
        },
        {
          id: "intl-2026-10-02-editors-box",
          authorName: "COMMUNE Editors",
          body: "EDITOR\u2019S BOX \u2014 Oct 2 International desk\n\nNepal Sep 15 pack retired from front seed. Watch: Spain snap-election odds; France school reopenings; Merz coalition votes; Yemen Red Sea shipping advisories; Ukraine domestic-missile claims verification; Tigray front lines; EU return-hub rollouts. Print lock: wire pulled from live /api/news/international Google News RSS \u00b7 World at ~3:26pm CT 2026-10-02. Rating note: adult International plate (war present) \u2014 not for teen NEWS.",
          createdAt: "2026-10-02T17:15:00.000Z",
          seeded: true
        }
      ]
    }
  };

  var HOT_TOPIC_POOLS = {
    nationwide: [
      [
        { id: "ht-us-a1", authorName: "National Desk", kind: "news", source: "Google News · US", body: "CAPITOL HEAT — Overnight committee calendars and market opens lead the US plate this hour.", createdAt: null, seeded: true },
        { id: "ht-us-a2", authorName: "Weather Wire", kind: "news", source: "Google News · US", body: "STORM TRACK — Coastal and inland forecasts split the national weather column.", createdAt: null, seeded: true },
        { id: "ht-us-a3", authorName: "Sports Desk", kind: "news", source: "Google News · US", body: "LATE SCORES — Primetime finishes reshuffle the nationwide sports brief.", createdAt: null, seeded: true },
        { id: "ht-us-a4", authorName: "Business Wire", kind: "news", source: "Google News · US", body: "OPENING BELL — Futures and labor notes headline the business strip.", createdAt: null, seeded: true },
      ],
      [
        { id: "ht-us-b1", authorName: "Politics Desk", kind: "news", source: "Google News · US", body: "CAMPAIGN TRAIL — Cross-country stops dominate the politics lead.", createdAt: null, seeded: true },
        { id: "ht-us-b2", authorName: "Tech Wire", kind: "news", source: "Google News · US", body: "GADGET BEAT — Platform filings and product teasers fill the tech brief.", createdAt: null, seeded: true },
        { id: "ht-us-b3", authorName: "Health Desk", kind: "news", source: "Google News · US", body: "CLINIC NOTES — Public-health advisories round out the national health column.", createdAt: null, seeded: true },
        { id: "ht-us-b4", authorName: "Culture Desk", kind: "news", source: "Google News · US", body: "WEEKEND ARTS — Premieres and streaming drops lead culture nationwide.", createdAt: null, seeded: true },
      ],
      [
        { id: "ht-us-c1", authorName: "Justice Wire", kind: "news", source: "Google News · US", body: "COURT DOCKET — Appellate rulings headline the justice brief.", createdAt: null, seeded: true },
        { id: "ht-us-c2", authorName: "Energy Desk", kind: "news", source: "Google News · US", body: "GRID WATCH — Regional supply notes shape the energy column.", createdAt: null, seeded: true },
        { id: "ht-us-c3", authorName: "Travel Wire", kind: "news", source: "Google News · US", body: "AIR & RAIL — Holiday rush updates fill the travel strip.", createdAt: null, seeded: true },
        { id: "ht-us-c4", authorName: "National Desk", kind: "news", source: "Google News · US", body: "STATEHOUSE ROUNDUP — Governors’ agendas stitch the federalism page.", createdAt: null, seeded: true },
      ],
    ],
    international: [
      [
        { id: "ht-int-a1", authorName: "World Desk", kind: "news", source: "Google News · World", body: "DIPLOMACY WATCH — Summit arrivals and corridor talks lead the world plate.", createdAt: null, seeded: true },
        { id: "ht-int-a2", authorName: "Markets Abroad", kind: "news", source: "Google News · World", body: "FX OPEN — Overnight currency moves headline international business.", createdAt: null, seeded: true },
        { id: "ht-int-a3", authorName: "Europe Desk", kind: "news", source: "Google News · World", body: "CONTINENT BRIEF — Energy and border notes dominate Europe’s column.", createdAt: null, seeded: true },
        { id: "ht-int-a4", authorName: "Asia Desk", kind: "news", source: "Google News · World", body: "PACIFIC WIRE — Port schedules and tech supply headlines fill Asia.", createdAt: null, seeded: true },
      ],
      [
        { id: "ht-int-b1", authorName: "Middle East Desk", kind: "news", source: "Google News · World", body: "RED SEA LANE — Shipping alerts and regional talks lead the ME brief.", createdAt: null, seeded: true },
        { id: "ht-int-b2", authorName: "Africa Desk", kind: "news", source: "Google News · World", body: "CONTINENTAL NOTES — Elections and commodity moves shape Africa’s page.", createdAt: null, seeded: true },
        { id: "ht-int-b3", authorName: "LatAm Desk", kind: "news", source: "Google News · World", body: "AMERICAS SOUTH — Currency and climate briefs headline LatAm.", createdAt: null, seeded: true },
        { id: "ht-int-b4", authorName: "World Desk", kind: "news", source: "Google News · World", body: "HUMANITARIAN WIRE — Relief corridors and storm recovery round the plate.", createdAt: null, seeded: true },
      ],
      [
        { id: "ht-int-c1", authorName: "Science Abroad", kind: "news", source: "Google News · World", body: "LAB NOTES — International research drops fill the science strip.", createdAt: null, seeded: true },
        { id: "ht-int-c2", authorName: "Culture World", kind: "news", source: "Google News · World", body: "FESTIVAL CIRCUIT — Premieres abroad lead culture international.", createdAt: null, seeded: true },
        { id: "ht-int-c3", authorName: "Sports World", kind: "news", source: "Google News · World", body: "GLOBAL SCORES — Overnight fixtures reshape the sports wire.", createdAt: null, seeded: true },
        { id: "ht-int-c4", authorName: "World Desk", kind: "news", source: "Google News · World", body: "SECURITY BRIEF — Alliance drills and airspace notes close the page.", createdAt: null, seeded: true },
      ],
    ],
  };

  var hotTopicCursor = { nationwide: 0, international: 0, statewide: 0 };

  var PROFILE_SEED = {
    version: 1,
    displayName: "",
    bio: "",
    avatarUrl: "",
    visibility: "private"
  };

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatTime(iso) {
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return "";
      return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      });
    } catch (e) {
      return "";
    }
  }

  function initials(name) {
    var parts = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  /* —— EditionStore —— */
  var EditionStore = {
    load: function () {
      try {
        var raw = localStorage.getItem(EDITION_KEY);
        if (!raw) return null;
        var id = JSON.parse(raw);
        return typeof id === "string" && EDITIONS[id] ? id : null;
      } catch (e) {
        return null;
      }
    },
    save: function (id) {
      try {
        localStorage.setItem(EDITION_KEY, JSON.stringify(id));
        return true;
      } catch (e) {
        return false;
      }
    },
    getId: function () {
      return this.load() || "local";
    },
    setId: function (id) {
      if (!EDITIONS[id]) id = "local";
      this.save(id);
      return id;
    },
    getMeta: function () {
      return EDITIONS[this.getId()];
    }
  };

  /* —— ProfileStore —— */
  var ProfileStore = {
    load: function () {
      try {
        var raw = localStorage.getItem(PROFILE_KEY);
        if (!raw) return null;
        var data = JSON.parse(raw);
        if (!data || typeof data !== "object") return null;
        return data;
      } catch (e) {
        return null;
      }
    },
    save: function (data) {
      try {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(data));
        return true;
      } catch (e) {
        return false;
      }
    },
    get: function () {
      var data = this.load();
      if (!data) {
        data = JSON.parse(JSON.stringify(PROFILE_SEED));
        this.save(data);
      }
      if (data.visibility !== "public" && data.visibility !== "private") {
        data.visibility = "private";
      }
      return data;
    },
    update: function (fields) {
      var data = this.get();
      if (fields.displayName !== undefined) {
        data.displayName = String(fields.displayName || "").trim().slice(0, 80);
      }
      if (fields.bio !== undefined) {
        data.bio = String(fields.bio || "").trim().slice(0, 280);
      }
      if (fields.avatarUrl !== undefined) {
        data.avatarUrl = String(fields.avatarUrl || "").trim().slice(0, 500);
      }
      if (fields.visibility === "public" || fields.visibility === "private") {
        data.visibility = fields.visibility;
      }
      data.version = 1;
      if (!this.save(data)) return { ok: false, error: "Could not save profile." };
      return { ok: true, profile: data };
    },
    reset: function () {
      var data = JSON.parse(JSON.stringify(PROFILE_SEED));
      this.save(data);
      return data;
    }
  };

  /* —— FeedStore (posts keyed by edition) —— */
  var FeedStore = {
    load: function () {
      try {
        var raw = localStorage.getItem(FEED_KEY);
        if (!raw) return null;
        var data = JSON.parse(raw);
        if (!data || typeof data !== "object" || !data.byEdition) return null;
        return data;
      } catch (e) {
        return null;
      }
    },
    save: function (data) {
      try {
        localStorage.setItem(FEED_KEY, JSON.stringify(data));
        return true;
      } catch (e) {
        return false;
      }
    },
    getState: function () {
      var FEED_SEED_VERSION = 202610021; /* Oct 2 International wire pack (12 items) */
      var data = this.load();
      if (!data) {
        data = { version: FEED_SEED_VERSION, byEdition: {} };
        Object.keys(EDITIONS).forEach(function (id) {
          data.byEdition[id] = {
            posts: JSON.parse(JSON.stringify(EDITIONS[id].seedPosts))
          };
        });
        this.save(data);
        return data;
      }
      Object.keys(EDITIONS).forEach(function (id) {
        if (!data.byEdition[id] || !Array.isArray(data.byEdition[id].posts)) {
          data.byEdition[id] = {
            posts: JSON.parse(JSON.stringify(EDITIONS[id].seedPosts))
          };
        }
      });
      /* Refresh International wire pack when seed version bumps (keeps other editions). */
      if (!data.version || data.version < FEED_SEED_VERSION) {
        Object.keys(EDITIONS).forEach(function (id) {
          data.byEdition[id] = {
            posts: JSON.parse(JSON.stringify(EDITIONS[id].seedPosts))
          };
        });
        data.version = FEED_SEED_VERSION;
        this.save(data);
      }
      return data;
    },
    listPosts: function (editionId) {
      var state = this.getState();
      var bucket = state.byEdition[editionId] || state.byEdition.local;
      return bucket.posts.slice().sort(function (a, b) {
        return String(b.createdAt).localeCompare(String(a.createdAt));
      });
    },
    addPost: function (editionId, body, authorName) {
      var text = String(body || "").trim();
      if (!text) return { ok: false, error: "Post cannot be empty." };
      if (!EDITIONS[editionId]) editionId = "local";
      var state = this.getState();
      var post = {
        id: "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        authorName: authorName || "You",
        body: text.slice(0, 2000),
        createdAt: new Date().toISOString(),
        seeded: false
      };
      state.byEdition[editionId].posts.unshift(post);
      if (!this.save(state)) return { ok: false, error: "Could not save post." };
      return { ok: true, post: post };
    }
  };

  window.CognationEditionStore = EditionStore;
  window.CognationProfileStore = ProfileStore;
  window.CognationFeedStore = FeedStore;

  /* —— UI —— */
  function initCommune(root) {
    if (!root) return;

    var editionId = EditionStore.getId();
    var section = "feed";

    var dateEl = root.querySelector("[data-commune-date]");
    var subtitleEl = root.querySelector("[data-commune-edition-subtitle]");
    var labelEl = root.querySelector("[data-commune-edition-label]");
    var volumeEl = root.querySelector("[data-commune-volume]");
    var dekEl = root.querySelector("[data-commune-feed-dek]");
    var topicsLeftEl = root.querySelector("[data-commune-topics-left]");
    var topicsRightEl = root.querySelector("[data-commune-topics-right]");
    var editionInputs = root.querySelectorAll("[data-commune-edition]");
    var sectionBtns = root.querySelectorAll("[data-commune-section]");
    var panes = root.querySelectorAll("[data-commune-pane]");

    var feedList = root.querySelector("[data-commune-feed-list]");
    var feedEmpty = root.querySelector("[data-commune-feed-empty]");
    var feedForm = root.querySelector("[data-commune-feed-compose]");
    var feedInput = root.querySelector("#commune-feed-input");
    var feedStatus = root.querySelector("[data-commune-feed-status]");
    var refreshBtn = root.querySelector("[data-commune-refresh]");

    var profileForm = root.querySelector("[data-commune-profile-form]");
    var nameInput = root.querySelector("#commune-display-name");
    var bioInput = root.querySelector("#commune-bio");
    var avatarInput = root.querySelector("#commune-avatar-url");
    var profileStatus = root.querySelector("[data-commune-profile-status]");
    var resetBtn = root.querySelector("[data-commune-profile-reset]");
    var previewName = root.querySelector("[data-commune-preview-name]");
    var previewBio = root.querySelector("[data-commune-preview-bio]");
    var previewVisLabel = root.querySelector("[data-commune-preview-vis-label]");
    var previewVis = root.querySelector("[data-commune-preview-visibility]");
    var avatarEl = root.querySelector("[data-commune-avatar]");
    var briefByline = root.querySelector("[data-commune-brief-byline]");
    var briefVis = root.querySelector("[data-commune-brief-visibility]");
    var briefLatest = root.querySelector("[data-commune-brief-latest]");

    function setStatus(el, text, isError) {
      if (!el) return;
      if (!text) {
        el.hidden = true;
        el.textContent = "";
        el.classList.remove("is-error");
        return;
      }
      el.hidden = false;
      el.textContent = text;
      el.classList.toggle("is-error", !!isError);
    }

    function fillDate() {
      if (!dateEl) return;
      var now = new Date();
      dateEl.dateTime = now.toISOString();
      dateEl.textContent = now.toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
      });
    }

    function renderTopics(ul, items) {
      if (!ul) return;
      ul.innerHTML = "";
      (items || []).forEach(function (item) {
        var li = document.createElement("li");
        if (item && typeof item === "object" && item.href) {
          var a = document.createElement("a");
          a.href = item.href;
          a.rel = "noopener noreferrer";
          a.textContent = item.text;
          li.appendChild(a);
        } else {
          li.textContent = String(item);
        }
        ul.appendChild(li);
      });
    }

    function applyEditionChrome() {
      var meta = EDITIONS[editionId] || EDITIONS.local;
      if (root) {
        root.setAttribute("data-edition", editionId);
        root.classList.toggle("commune-paper--broadsheet", true); /* all editions share International broadsheet look */
      }
      if (subtitleEl) subtitleEl.textContent = meta.subtitle;
      if (labelEl) labelEl.textContent = meta.dateline;
      if (volumeEl) volumeEl.textContent = meta.volume;
      if (dekEl) dekEl.textContent = meta.dek;
      renderTopics(topicsLeftEl, meta.topicsLeft);
      renderTopics(topicsRightEl, meta.topicsRight);
      if (editionId === "nationwide" && labelEl) {
        labelEl.textContent = "Nationwide · " + getMemberCountry();
      }
      if (editionId === "nationwide" && dekEl) {
        dekEl.textContent =
          "What’s happening in " +
          getMemberCountry() +
          " — national sources (Google News–style). Same broadsheet as International.";
      }
      editionInputs.forEach(function (input) {
        input.checked = input.value === editionId;
      });
      updateRefreshButton();
    }

    function showSection(id) {
      section = id === "letters" || id === "correspondent" ? id : "feed";
      sectionBtns.forEach(function (btn) {
        var active = btn.getAttribute("data-commune-section") === section;
        btn.classList.toggle("is-active", active);
        if (active) btn.setAttribute("aria-current", "true");
        else btn.removeAttribute("aria-current");
      });
      panes.forEach(function (pane) {
        var match = pane.getAttribute("data-commune-pane") === section;
        pane.hidden = !match;
      });
    }

    function authorForPosts() {
      var p = ProfileStore.get();
      return p.displayName || "You";
    }

    function updateRefreshButton() {
      if (!refreshBtn) return;
      var show =
        editionId === "statewide" ||
        editionId === "nationwide" ||
        editionId === "international";
      refreshBtn.hidden = !show;
    }

    function stampTimes(posts) {
      var now = Date.now();
      return (posts || []).map(function (p, i) {
        var copy = {};
        Object.keys(p).forEach(function (k) {
          copy[k] = p[k];
        });
        copy.createdAt = new Date(now - i * 7 * 60 * 1000).toISOString();
        copy.id = (p.id || "ht") + "-" + now.toString(36) + "-" + i;
        return copy;
      });
    }

    function applyRefreshedPosts(posts, note) {
      var state = FeedStore.getState();
      state.byEdition[editionId] = { posts: posts };
      FeedStore.save(state);
      renderFeed();
      setStatus(feedStatus, note || "Plate refreshed with new hot topics.", false);
    }

    function refreshStatewidePlate() {
      hotTopicCursor.statewide = (hotTopicCursor.statewide || 0) + 1;
      var posts = postsFromTower("statewide");
      /* Rotate emphasis: shuffle order slightly while keeping likes bias */
      var shift = hotTopicCursor.statewide % Math.max(posts.length, 1);
      posts = posts.slice(shift).concat(posts.slice(0, shift));
      posts = posts.map(function (p, i) {
        var copy = {};
        Object.keys(p).forEach(function (k) {
          copy[k] = p[k];
        });
        copy.id = "statewide-refresh-" + Date.now().toString(36) + "-" + i;
        copy.body =
          "@statewide refresh · " +
          (p.body || "").replace(/^@statewide[^\—]*—\s*/, "");
        return copy;
      });
      /* Don't persist tower-derived into feed store permanently as only source — still render */
      if (!feedList) return;
      feedList.innerHTML = "";
      wirePage = 0;
      posts.forEach(function (post, idx) {
        appendPostEl(post, { lead: idx === 0 });
      });
      setEndlessUi(endlessOn);
      if (endlessOn) bindEndlessObserver();
      setStatus(
        feedStatus,
        "Statewide hot topics reshuffled from most-liked Tower hits.",
        false
      );
    }

    function refreshFromPools(edition) {
      var pools = HOT_TOPIC_POOLS[edition];
      if (!pools || !pools.length) return;
      hotTopicCursor[edition] = (hotTopicCursor[edition] || 0) + 1;
      var idx = hotTopicCursor[edition] % pools.length;
      var posts = stampTimes(pools[idx]);
      if (edition === "nationwide") {
        var country =
          typeof getMemberCountry === "function"
            ? getMemberCountry()
            : "United States";
        posts = posts.map(function (p) {
          var c = {};
          Object.keys(p).forEach(function (k) {
            c[k] = p[k];
          });
          c.source = "Google News · " + country;
          c.sourceDetail = c.source + " · refreshed plate";
          return c;
        });
      } else {
        posts = posts.map(function (p) {
          var c = {};
          Object.keys(p).forEach(function (k) {
            c[k] = p[k];
          });
          c.sourceDetail = (p.source || "Google News · World") + " · refreshed plate";
          return c;
        });
      }
      applyRefreshedPosts(
        posts,
        edition === "nationwide"
          ? "Nationwide plate refreshed with new national hot topics."
          : "International plate refreshed with new world hot topics."
      );
    }

    function refreshHotTopics() {
      if (editionId === "local") return;
      setStatus(feedStatus, "Refreshing hot topics…", false);
      if (editionId === "statewide") {
        refreshStatewidePlate();
        return;
      }
      var apiPath =
        editionId === "nationwide"
          ? "/api/news/nationwide?country=" +
            encodeURIComponent(
              typeof getMemberCountry === "function"
                ? getMemberCountry()
                : "United States"
            )
          : editionId === "international"
            ? "/api/news/international"
            : null;
      if (!apiPath) return;
      fetch(apiPath, { headers: { Accept: "application/json" } })
        .then(function (res) {
          if (!res.ok) throw new Error("api " + res.status);
          return res.json();
        })
        .then(function (data) {
          if (!data || !data.ok || !data.seedPosts || !data.seedPosts.length) {
            throw new Error("empty");
          }
          var posts = data.seedPosts.map(function (p) {
            var c = {};
            Object.keys(p).forEach(function (k) {
              c[k] = p[k];
            });
            c.sourceDetail = (p.source || data.source || "Google News") + " · live refresh";
            return c;
          });
          applyRefreshedPosts(posts, "Live hot topics loaded.");
        })
        .catch(function () {
          refreshFromPools(editionId);
        });
    }


    var endlessToggle = root.querySelector("[data-commune-endless]");
    var feedSentinel = root.querySelector("[data-commune-feed-sentinel]");
    var feedLoading = root.querySelector("[data-commune-feed-loading]");
    var endlessOn = false;
    var wirePage = 0;
    var wireLoading = false;
    var WIRE_BATCH = 8;
    var feedObserver = null;

    try {
      var endlessStored = localStorage.getItem(FEED_ENDLESS_KEY);
      endlessOn = endlessStored === null ? true : endlessStored === "1";
    } catch (e) {
      endlessOn = true;
    }
    if (endlessToggle) endlessToggle.checked = endlessOn;

    var WIRE_LINES = {
      local: [
        "Council chamber lights stayed on past midnight as the zoning map was redrawn.",
        "Market square vendors report a quieter morning after last week’s storm.",
        "Library late fees paused for the season — cards still welcome at the desk.",
        "River walk railings get a fresh coat before weekend foot traffic.",
        "School board posts draft calendar; public comment opens Tuesday.",
      ],
      statewide: [
        "Capitol hallway buzz: two committees trade amendments before lunch.",
        "Highway crew shifts overnight to finish striping before the holiday rush.",
        "Farm bureau notes early harvest chatter across three counties.",
        "State university labs open an evening lecture series to the public.",
        "Utility board weighs a summer rate board packet — decision next session.",
      ],
      nationwide: [
        "Wire desk: markets open mixed as traders watch the afternoon print.",
        "Transit hubs report steady holiday volume with longer security lines.",
        "Weather service flags a slow-moving front across the interior.",
        "Court filings pile up in a closely watched antitrust docket.",
        "Labor talks resume after a weekend cooldown — no deal yet.",
      ],
      international: [
        "Desk cable: overnight markets lean cautious ahead of a major summit.",
        "Port schedules shuffle after a weather delay on the eastern route.",
        "Cultural festival crowds fill the old quarter through closing bells.",
        "Currency desks note a quiet session with thin overnight volume.",
        "Relief flights cleared for a second corridor after morning fog lifted.",
      ],
    };

    var WIRE_BYLINES = [
      "City Desk",
      "Wire Service",
      "Correspondent",
      "Night Desk",
      "Briefing Staff",
      "Stringer",
    ];

    function readEndless() {
      try {
        return localStorage.getItem(FEED_ENDLESS_KEY) === "1";
      } catch (e) {
        return false;
      }
    }

    function writeEndless(on) {
      try {
        localStorage.setItem(FEED_ENDLESS_KEY, on ? "1" : "0");
      } catch (e) {}
    }

    function makeWirePost(seq) {
      var lines = WIRE_LINES[editionId] || WIRE_LINES.local;
      var body = lines[seq % lines.length];
      var byline = WIRE_BYLINES[seq % WIRE_BYLINES.length];
      var minutesAgo = (seq + 1) * 7;
      var created = new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
      return {
        id: "wire-" + editionId + "-" + seq,
        authorName: byline,
        body: body + " (wire #" + (seq + 1) + ")",
        createdAt: created,
        seeded: true,
        wire: true,
      };
    }

    function appendPostEl(post, opts) {
      opts = opts || {};
      var postIdEarly = post.id || "";
      try {
        if (window.CognationModeration && typeof window.CognationModeration.isPostHidden === "function") {
          if (postIdEarly && window.CognationModeration.isPostHidden(postIdEarly)) return;
        }
      } catch (eHide) {}
      var article = document.createElement("article");
      article.className = "commune-feed-item paper-article";
      if (post.wire) article.classList.add("is-wire");
      if (opts.lead) article.classList.add("is-lead");
      var kind = post.kind || (post.wire ? "wire" : "news");
      if (kind === "social") article.classList.add("is-social");
      article.setAttribute(
        "aria-label",
        (post.authorName || "Author") + " at " + formatTime(post.createdAt)
      );
      var authorHtml = escapeHtml(post.authorName || "Anonymous");
      if (post.profileHref) {
        authorHtml =
          '<a class="commune-profile-link" href="' +
          escapeHtml(post.profileHref) +
          '">' +
          authorHtml +
          "</a>";
      }
      var sourceLine = "";
      if (post.source || post.sourceDetail) {
        sourceLine =
          '<p class="commune-feed-source">Source: ' +
          escapeHtml(post.sourceDetail || post.source) +
          (post.profileHref
            ? ' · <a class="commune-profile-link" href="' +
              escapeHtml(post.profileHref) +
              '">Tower profile</a>'
            : "") +
          "</p>";
      }
      article.innerHTML =
        '<header class="commune-feed-meta">' +
        '<span class="commune-social-kind">' +
        escapeHtml(kind === "social" ? "Social" : kind === "wire" ? "Wire" : "News") +
        "</span>" +
        '<span class="commune-feed-author">' +
        authorHtml +
        "</span>" +
        '<time datetime="' +
        escapeHtml(post.createdAt) +
        '">' +
        escapeHtml(formatTime(post.createdAt)) +
        "</time>" +
        "</header>" +
        '<p class="commune-feed-body">' +
        (function () {
          var safe = escapeHtml(post.body);
          if (editionId === "statewide" || editionId === "local") {
            safe = safe.replace(/@([a-z0-9_-]+)/gi, function (_, h) {
              var href =
                h.toLowerCase() === "statewide"
                  ? "#tab-news"
                  : "#tower-profile-" + h.toLowerCase();
              return (
                '<a class="commune-at-link" href="' +
                href +
                '">@' +
                h +
                "</a>"
              );
            });
          }
          return safe;
        })() +
        "</p>" +
        sourceLine +
        '<footer class="news-report-bar" data-news-report>' +
        '<button type="button" class="btn btn-secondary news-report-btn" data-news-report-toggle>Report</button>' +
        '<div class="news-report-menu" data-news-report-menu hidden>' +
        '<button type="button" class="news-report-option" data-news-report-reason="harmful">Harmful</button>' +
        '<button type="button" class="news-report-option" data-news-report-reason="untruthful">Untruthful</button>' +
        "</div>" +
        '<span class="news-report-status" data-news-report-status hidden role="status"></span>' +
        "</footer>";
      var postId = post.id || ("news-" + String(post.createdAt || Date.now()) + "-" + Math.random().toString(36).slice(2, 7));
      article.setAttribute("data-news-post", "");
      article.setAttribute("data-post-id", postId);
      try {
        if (window.CognationSeedOpsNewsLog && window.CognationSeedOpsNewsLog.onNewsPostRendered) {
          window.CognationSeedOpsNewsLog.onNewsPostRendered(post, editionId, {
            rankedIndex: opts.lead ? 0 : undefined,
          });
        }
        if (
          window.CognationSeedOpsBadge &&
          post &&
          (post.isSeed || post.accountKind === "seed" || post.accountKind === "ops")
        ) {
          var authorEl = article.querySelector(".commune-feed-author");
          if (authorEl) window.CognationSeedOpsBadge.ensureBadge(authorEl, post);
        }
      } catch (eSeedRender) {}
      feedList.appendChild(article);
    }

    function setEndlessUi(on) {
      endlessOn = !!on;
      if (feedList) feedList.classList.toggle("is-endless", endlessOn);
      if (feedSentinel) feedSentinel.hidden = !endlessOn;
      if (!endlessOn && feedLoading) feedLoading.hidden = true;
      if (feedList) feedList.setAttribute("aria-busy", "false");
    }

    function loadMoreWire() {
      if (!endlessOn || !feedList || wireLoading) return;
      wireLoading = true;
      if (feedList) feedList.setAttribute("aria-busy", "true");
      if (feedLoading) feedLoading.hidden = false;
      var start = wirePage * WIRE_BATCH;
      for (var i = 0; i < WIRE_BATCH; i++) {
        appendPostEl(makeWirePost(start + i));
      }
      wirePage += 1;
      if (feedEmpty) feedEmpty.hidden = true;
      wireLoading = false;
      if (feedList) feedList.setAttribute("aria-busy", "false");
      if (feedLoading) feedLoading.hidden = true;
      /* Keep sentinel at end of the scroll list */
      if (feedSentinel) feedList.appendChild(feedSentinel);
    }

    function bindEndlessObserver() {
      if (feedObserver) {
        feedObserver.disconnect();
        feedObserver = null;
      }
      if (!endlessOn || !feedSentinel || typeof IntersectionObserver === "undefined") {
        return;
      }
      feedObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) loadMoreWire();
          });
        },
        { root: feedList, rootMargin: "80px", threshold: 0 }
      );
      feedObserver.observe(feedSentinel);
      /* First fill if the list is short */
      loadMoreWire();
    }

    function towerProfileSlug(name) {
      return String(name || "neighbor")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "neighbor";
    }

    function postsFromTower() {
      if (!window.CognationTowerStore || typeof window.CognationTowerStore.newsList !== "function") {
        return [];
      }
      var list = window.CognationTowerStore.newsList();
      return list.map(function (p) {
        var author = p.authorName || "Neighbor";
        var slug = towerProfileSlug(author);
        /* Prefer profile handle badge when this post is from the local profile */
        if (window.CognationTowerProfileStore) {
          var me = window.CognationTowerProfileStore.get();
          var myHandle = (me.handle || "").replace(/^@/, "").toLowerCase();
          if (myHandle && me.displayName && author === me.displayName) {
            slug = myHandle;
          } else if (p.handle) {
            slug = String(p.handle).replace(/^@/, "").toLowerCase();
          }
        } else if (p.handle) {
          slug = String(p.handle).replace(/^@/, "").toLowerCase();
        }
        var bits = [];
        (p.attachments || []).forEach(function (a) {
          var k = a.kind || "document";
          bits.push(
            (k === "photo" && "Photo") ||
              (k === "video" && "Video") ||
              (k === "note" && "Notes") ||
              (k === "art" && "Art") ||
              "Document"
          );
          if (a.label || a.name) bits.push(a.label || a.name);
        });
        var attachLine = bits.length ? " [" + bits.join(" · ") + "]" : "";
        var kind = "social";
        var atts = p.attachments || [];
        if (atts.some(function (a) { return a.kind === "note" || a.kind === "document"; })) {
          kind = "news";
        }
        var body = (p.body || "Shared an update.") + attachLine;
        var isFof =
          !!(p.shareBeyondFriends || p.audience === "friends_of_friends") ||
          /@friends?\s*of\s*friends\b/i.test(body) ||
          /@friendsoffriends\b/i.test(body);
        var towerLabel = p.towerKind === "professional" ? "Professional tower" : "Personal tower";
        var reactions = Number(p.likes) || 0;
        if (p.reactions && typeof p.reactions === "object") {
          Object.keys(p.reactions).forEach(function (face) {
            var users = p.reactions[face];
            if (Array.isArray(users)) reactions += users.length;
          });
        }
        if (p.title && body.indexOf(p.title) !== 0) body = p.title + " — " + body;
        var sourceLabel = towerLabel + " · " + reactions + " reactions";
        var sourceDetail = "Most reacted on " + towerLabel.toLowerCase() + " · @" + slug;
        if (isFof && body.toLowerCase().indexOf("@friendsoffriends") === -1) {
          body = "@friendsoffriends · " + body;
        }
        var seedMeta = {};
        try {
          if (window.CognationSeedOps && window.CognationSeedOps.classify) {
            seedMeta = window.CognationSeedOps.classify({
              displayName: author,
              handle: slug,
              accountKind: p.accountKind,
              isSeed: p.isSeed,
              seedFleetId: p.seedFleetId,
              id: p.authorProfileId || p.profileId,
            });
          }
        } catch (eSeed) {}
        return {
          id: "from-tower-" + (p.towerKind || "personal") + "-" + p.id,
          authorName: author,
          body: body,
          createdAt: p.createdAt,
          kind: kind,
          source: sourceLabel,
          sourceDetail: sourceDetail,
          profileHref: "#tower-profile-" + slug,
          profileSlug: slug,
          likes: p.likes || 0,
          seeded: true,
          fromTower: true,
          towerPostId: p.id,
          accountKind: seedMeta.accountKind || p.accountKind || "",
          isSeed: !!(seedMeta.isSeed || p.isSeed),
          seedFleetId: p.seedFleetId || "",
          minAge: p.minAge || 0,
          audience: p.audience || "",
          reactions: p.reactions || {},
        };
      });
    }

    function renderFeed() {
      if (!feedList) return;
      var posts =
        editionId === "local" || editionId === "statewide"
          ? postsFromTower()
          : FeedStore.listPosts(editionId);
      try {
        if (window.CognationSeedOpsNewsLog && window.CognationSeedOpsNewsLog.onTowerPostsForNews) {
          window.CognationSeedOpsNewsLog.onTowerPostsForNews(posts, editionId);
        }
      } catch (eNewsLog) {}
      feedList.innerHTML = "";
      wirePage = 0;
      wireLoading = false;
      if (!feedSentinel || !feedSentinel.isConnected) {
        feedSentinel = document.createElement("div");
        feedSentinel.className = "commune-feed-sentinel";
        feedSentinel.setAttribute("data-commune-feed-sentinel", "");
        feedSentinel.setAttribute("aria-hidden", "true");
        feedSentinel.hidden = true;
      }
      feedList.appendChild(feedSentinel);
      if (!posts.length && !endlessOn) {
        if (feedEmpty) feedEmpty.hidden = false;
      } else {
        if (feedEmpty) feedEmpty.hidden = true;
        posts.forEach(function (post, idx) {
          appendPostEl(post, { lead: idx === 0 });
        });
      }
      setEndlessUi(endlessOn);
      if (endlessOn) {
        if (feedEmpty) feedEmpty.hidden = true;
        bindEndlessObserver();
      } else if (feedObserver) {
        feedObserver.disconnect();
        feedObserver = null;
      }
      if (briefLatest) {
        if (posts.length) {
          var latest = posts[0];
          var preview = latest.body.length > 90 ? latest.body.slice(0, 87) + "…" : latest.body;
          briefLatest.textContent = latest.authorName + ": " + preview;
        } else {
          briefLatest.textContent = "No posts yet.";
        }
      }
    }

    function renderProfile() {
      var p = ProfileStore.get();
      if (nameInput) nameInput.value = p.displayName || "";
      if (bioInput) bioInput.value = p.bio || "";
      if (avatarInput) avatarInput.value = p.avatarUrl || "";
      root.querySelectorAll("[data-commune-visibility]").forEach(function (radio) {
        radio.checked = radio.value === p.visibility;
      });

      var display = p.displayName || "Your display name";
      var bio = p.bio || "Short bio goes here.";
      if (previewName) previewName.textContent = display;
      if (previewBio) previewBio.textContent = bio;
      if (previewVisLabel) {
        previewVisLabel.textContent = p.visibility === "public" ? "Public" : "Private";
      }
      if (previewVis) {
        previewVis.classList.toggle("is-public", p.visibility === "public");
        previewVis.classList.toggle("is-private", p.visibility !== "public");
      }

      if (avatarEl) {
        avatarEl.innerHTML = "";
        avatarEl.classList.remove("has-image");
        if (p.avatarUrl) {
          var img = document.createElement("img");
          img.src = p.avatarUrl;
          img.alt = "";
          img.width = 64;
          img.height = 64;
          img.loading = "lazy";
          img.onerror = function () {
            avatarEl.classList.remove("has-image");
            avatarEl.innerHTML = "";
            avatarEl.textContent = initials(p.displayName);
          };
          avatarEl.classList.add("has-image");
          avatarEl.appendChild(img);
        } else {
          avatarEl.textContent = initials(p.displayName);
        }
      }

      if (briefByline) {
        briefByline.textContent = p.displayName
          ? "Byline: " + p.displayName
          : "Set your Correspondent name under the desk.";
      }
      if (briefVis) {
        briefVis.textContent =
          p.visibility === "public"
            ? "Profile is Public (demo flag)."
            : "Profile is Private.";
      }
    }

    function setEdition(id) {
      editionId = EditionStore.setId(id);
      applyEditionChrome();
      renderFeed();
      setStatus(feedStatus, "Switched to " + (EDITIONS[editionId].label) + " edition (demo).", false);
      try {
        if (window.CognationFriction) window.CognationFriction.begin("news", "edition:" + editionId);
      } catch (e) {}
    }

    editionInputs.forEach(function (input) {
      input.addEventListener("change", function () {
        if (input.checked) setEdition(input.value);
      });
    });

    sectionBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        showSection(btn.getAttribute("data-commune-section"));
      });
    });

    if (refreshBtn) {
      refreshBtn.addEventListener("click", function () {
        try {
          if (window.CognationFriction) window.CognationFriction.begin("news", "news-refresh");
        } catch (e) {}
        refreshHotTopics();
      });
    }

    if (endlessToggle) {
      endlessToggle.addEventListener("change", function () {
        writeEndless(endlessToggle.checked);
        endlessOn = endlessToggle.checked;
        renderFeed();
        setStatus(
          feedStatus,
          endlessOn
            ? "Never-ending scroll on — keep scrolling for more wire copy."
            : "Never-ending scroll off.",
          false
        );
      });
    }

    if (feedForm && feedInput) {
      feedForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var result = FeedStore.addPost(editionId, feedInput.value, authorForPosts());
        if (!result.ok) {
          setStatus(feedStatus, result.error || "Could not publish.", true);
          try {
            if (window.CognationFriction) window.CognationFriction.retry("news", "publish_error");
          } catch (frNews) {}
          return;
        }
        feedInput.value = "";
        setStatus(
          feedStatus,
          "Published to " + EDITIONS[editionId].label + " edition (saved locally).",
          false
        );
        try {
          if (window.CognationFriction) window.CognationFriction.complete("news");
        } catch (frNewsOk) {}
        renderFeed();
        feedInput.focus();
      });
    }

    if (profileForm) {
      profileForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var name = nameInput ? nameInput.value.trim() : "";
        if (!name) {
          setStatus(profileStatus, "Display name is required.", true);
          if (nameInput) nameInput.focus();
          return;
        }
        var vis = "private";
        root.querySelectorAll("[data-commune-visibility]").forEach(function (r) {
          if (r.checked) vis = r.value;
        });
        var result = ProfileStore.update({
          displayName: name,
          bio: bioInput ? bioInput.value : "",
          avatarUrl: avatarInput ? avatarInput.value : "",
          visibility: vis
        });
        if (!result.ok) {
          setStatus(profileStatus, result.error || "Could not save.", true);
          return;
        }
        setStatus(
          profileStatus,
          "Profile saved locally (" + result.profile.visibility + ").",
          false
        );
        renderProfile();
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        ProfileStore.reset();
        setStatus(profileStatus, "Profile reset to defaults.", false);
        renderProfile();
      });
    }

    fillDate();
    applyEditionChrome();
    showSection("feed");
    renderProfile();
    renderFeed();
  }

  function boot() {
    var root = document.querySelector("[data-commune-app]");
    if (root) initCommune(root);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
