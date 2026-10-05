"""No event text sends a visitor to the site we list from.

The lines are real, from the descriptions the sites published.

    cd WebScarping && python -m unittest discover tests
"""

import unittest

from event_sources.common import scrub_partners


class Removed(unittest.TestCase):
    def test_every_partner_line_goes(self):
        for line in [
            "Tickets available at Antoine Ticketing or via Whatsapp on 03-540459",
            "Reservations: 81 233 144 or Tick'it. Book your spot!",
            "Reservations on 70 62 62 00 or Librairie Antoine",
            "Tickets are available at all Antoine Library branches",
            "🎟️ tickit.co",
            "* Secure your booking through Tickit.",
            "Réservations à la Librairie Antoine et en ligne.",
            "🎟️ Tickets are now available on Tickit.co",
            "Billetterie www.antoineticketing.com et dans toutes les branches de la Librairie ANTOINE",
            "Book now on ihjoz.com",
            "Available at Ticketing Box Office outlets",
            "The event is organized by District 7 Beirut . For reservations contact +961 81 233 144 or book your tickets through Tick’it.",
        ]:
            with self.subTest(line=line):
                self.assertEqual(scrub_partners(f"Doors at 8.\n{line}\nSee you there"), "Doors at 8.\nSee you there")

    def test_in_a_long_paragraph_only_the_sentence_goes(self):
        story = ("A play about memory, loss and the city that keeps rebuilding itself, told over one long night "
                 "by two old friends. ")
        text = story + "Tickets are on sale at Antoine Ticketing. " + story.strip()
        out = scrub_partners(text)
        self.assertNotIn("Antoine Ticketing", out)
        self.assertEqual(out.count("A play about memory"), 2)


class Kept(unittest.TestCase):
    def test_people_called_antoine_stay(self):
        for line in [
            "Paris, 1928. A young painter in vogue, Antoine Balestro, has been unable to paint.",
            "with Antoine Dib (accordion) and Mazen Kiwan",
            "Stage Manager: Antoinette El Helou",
            "Antoine bernard - Guitarist with a background spanning classical and contemporary music.",
        ]:
            with self.subTest(line=line):
                self.assertEqual(scrub_partners(line), line)

    def test_other_links_stay(self):
        line = "Trailer https://vimeo.com/1119394518"
        self.assertEqual(scrub_partners(line), line)


if __name__ == "__main__":
    unittest.main()
