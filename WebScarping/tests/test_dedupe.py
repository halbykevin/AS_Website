"""Cross-listing rules in event_sources/dedupe.py.

The pairs are real listings from the sites, trimmed to what the matcher reads.

    cd WebScarping && python -m unittest discover tests
"""

import unittest

from event_sources import dedupe

ORDER = ["ticketingboxoffice", "tickit", "ihjoz", "antoineticketing"]


def ev(source, ext, title, venue, *days, time="08:30 PM"):
    e = {
        "source": source, "externalId": ext, "title": title, "venue": venue,
        "ticketUrl": f"https://{source}.example/{ext}", "categoryName": "Events",
        "dates": [{"date": d, "time": time, "label": "", "venue": venue,
                   "url": f"https://{source}.example/{ext}/{d}"} for d in days],
    }
    dedupe.set_primary(e, today="2026-10-01")
    return e


def run(*events):
    return dedupe.collapse(list(events), ORDER)


class SameNight(unittest.TestCase):
    def test_near_identical_title_needs_nothing_else(self):
        kept, dropped = run(
            ev("tickit", "a", "SHIMZA at IRIS Beirut - Sep 03", "IRIS", "2026-10-03"),
            ev("ihjoz", "b", "SHIMZA Live at Iris Beirut - Sep 03", "Iris Rooftop", "2026-10-03"),
        )
        self.assertEqual(len(kept), 1)
        self.assertEqual(dropped[0]["rule"], "same night")

    def test_reordered_and_respelled_title_at_the_same_venue(self):
        kept, dropped = run(
            ev("tickit", "a", "Rula Korban - Chi Tayeb", "Metro Al Madina", "2026-10-28"),
            ev("antoineticketing", "b",
               "Chi Tayib (Something Yum) - Stand-up show by Rula Korban",
               "Metro Al Madina", "2026-10-28"),
        )
        self.assertEqual(len(kept), 1)
        self.assertEqual(kept[0]["source"], "tickit")  # priority, not length
        self.assertEqual(dropped[0]["rule"], "same night, same venue")

    def test_accents_do_not_split_a_title(self):
        kept, _ = run(
            ev("ticketingboxoffice", "a", "Mensonge Blanc - Mise en scène Lina Abiad",
               "Théâtre Le Monnot", "2026-10-30"),
            ev("antoineticketing", "b", "Mensonge Blanc - Mise en scene Lina Abiad",
               "Le Monnot", "2026-10-30"),
        )
        self.assertEqual(len(kept), 1)

    def test_arabic_titles_match(self):
        kept, _ = run(
            ev("ticketingboxoffice", "a", "بلّشت", "Tournesol", "2026-10-10"),
            ev("antoineticketing", "b", "بلشت", "Theatre Tournesol", "2026-10-10"),
        )
        self.assertEqual(len(kept), 1)

    def test_loose_title_is_not_enough_without_the_venue(self):
        kept, _ = run(
            ev("tickit", "a", "Rula Korban - Chi Tayeb", "Hidden Cellar", "2026-10-28"),
            ev("antoineticketing", "b", "Chi Tayib - Stand-up show by Rula Korban",
               "Metro Al Madina", "2026-10-28"),
        )
        self.assertEqual(len(kept), 2)

    def test_one_shared_word_is_not_a_match(self):
        # Same club, same night, two different parties under one promoter.
        kept, _ = run(
            ev("tickit", "a", "2ND SUN x Innellea presents Belonging", "Ballroom Blitz", "2026-10-11"),
            ev("ihjoz", "b", "2ND SUN Halloween: A Space Odyssey", "Ballroom Blitz", "2026-10-11"),
        )
        self.assertEqual(len(kept), 2)

    def test_one_site_is_never_loosely_matched_with_itself(self):
        # Two films the same night at one cinema, both on Antoine.
        kept, _ = run(
            ev("antoineticketing", "a", "Jeunes mères - Jean-Pierre and Luc Dardenne",
               "Metropolis Cinema", "2026-10-12"),
            ev("antoineticketing", "b", "Le jeune Ahmed - Luc and Jean-Pierre Dardenne",
               "Metropolis Cinema", "2026-10-12"),
        )
        self.assertEqual(len(kept), 2)


class SplitRun(unittest.TestCase):
    def test_nights_split_between_sites_become_one_event(self):
        kept, dropped = run(
            ev("tickit", "a", "Allah Yestor", "Tournesol Tayouneh", "2026-10-22"),
            ev("antoineticketing", "b", "Allah Yestor - Nibal Arakji & Ali Ettihad",
               "Theatre Tournesol", "2026-10-07", "2026-10-08", "2026-10-09"),
        )
        self.assertEqual(len(kept), 1)
        self.assertEqual(dropped[0]["rule"], "same run")
        self.assertEqual(dropped[0]["nightsAdded"], 3)
        dates = kept[0]["dates"]
        self.assertEqual([d["date"] for d in dates],
                         ["2026-10-07", "2026-10-08", "2026-10-09", "2026-10-22"])
        # Each night still books where it is sold.
        self.assertIn("antoineticketing", dates[0]["url"])
        self.assertIn("tickit", dates[-1]["url"])
        self.assertEqual(kept[0]["primaryDate"], "2026-10-07")

    def test_a_touring_show_stays_separate(self):
        kept, _ = run(
            ev("ihjoz", "a", "Mario Moubarak Live At Tooty", "Tooty", "2026-10-14"),
            ev("antoineticketing", "b", "Mario Moubarak Live at Metro", "Metro Al Madina", "2026-10-19"),
        )
        self.assertEqual(len(kept), 2)

    def test_neighbouring_stages_are_different_venues(self):
        kept, _ = run(
            ev("tickit", "a", "Hishik Bishik Show", "Metro Al Madina", "2026-10-17"),
            ev("antoineticketing", "b", "Hishik Bishik Show", "Masrah Al Madina", "2026-10-24"),
        )
        self.assertEqual(len(kept), 2)

    def test_unknown_venue_never_joins_a_run(self):
        kept, _ = run(
            ev("ticketingboxoffice", "a", "Allah Yestor", "", "2026-10-22"),
            ev("antoineticketing", "b", "Allah Yestor", "Theatre Tournesol", "2026-10-07"),
        )
        self.assertEqual(len(kept), 2)


class Nights(unittest.TestCase):
    def test_overlapping_run_keeps_every_night_once(self):
        kept, dropped = run(
            ev("ticketingboxoffice", "a", "Mensonge Blanc", "Le Monnot",
               "2026-10-30", "2026-10-31", time="08:00 PM"),
            ev("antoineticketing", "b", "Mensonge Blanc - Texte Alexandre Najjar",
               "Théâtre Le Monnot", "2026-10-30", "2026-10-31", "2026-11-01"),
        )
        self.assertEqual(len(kept), 1)
        # 30th and 31st disagree on the time but are the same nights.
        self.assertEqual([d["date"] for d in kept[0]["dates"]],
                         ["2026-10-30", "2026-10-31", "2026-11-01"])
        self.assertEqual(dropped[0]["nightsAdded"], 1)

    def test_a_third_site_matches_a_night_taken_over(self):
        kept, dropped = run(
            ev("ticketingboxoffice", "a", "Allah Yestor", "Tournesol Tayouneh", "2026-10-22"),
            ev("ihjoz", "b", "Allah Yestor - Nibal Arakji", "Theatre Tournesol", "2026-10-08"),
            ev("antoineticketing", "c", "Allah Yestor", "Beirut Hall Venue", "2026-10-08"),
        )
        # ihjoz's night joins the box office's run, so the 8th is on it now -
        # and Antoine's listing of the 8th is that event, whatever the venue.
        self.assertEqual(len(kept), 1)
        self.assertEqual([d["source"] for d in dropped], ["ihjoz", "antoineticketing"])


class Normalize(unittest.TestCase):
    def test_folds_case_accents_and_noise(self):
        self.assertEqual(dedupe.normalize("Théâtre: Mensonge Blanc (Sold out) 2026"),
                         "theatre mensonge blanc")


if __name__ == "__main__":
    unittest.main()
