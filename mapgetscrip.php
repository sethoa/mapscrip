<?php
function displayChapter($book, $chap, $verses, $jst) {
    global $db;

    $query = "SELECT WebTitle, JSTTitle, NumChapters, " .
                    "JSTNumChapters, Parent, FullName, URLPath, CiteAbbr, Abbr " .
             "FROM books " .
             "WHERE Sequence = '$book'";
    $result = $db->query($query);
    if ($result->numRows() > 0) {
        list($webtitle, $jsttitle, $numchap, $jstnumchap,
             $parent, $fullname, $path, $citeAbbr, $bookAbbr) = $result->fetchRow();
        $result->free();
    }

    $verse_list = preg_replace("/\s*\(JST\)/", "", $verses);
    $heading1 = "";

    if ($jsttitle != "" && $jst == "JST") {
        $heading1 = "$jsttitle";
    } else {
        if ($book != "od") {
            $heading1 = "$webtitle";
        }
    }

    if (!isSupplementary($book)) {
        $heading2 = "";
        switch ($book) {
            case "302":
                $heading2 = "SECTION $chap";
                break;
            case "303":
                $heading2 = "OFFICIAL DECLARATION&#8212;$chap";
                break;
            case "403":
                $heading2 = "No. $chap";
                break;
            case "119":
                $heading2 = "PSALM $chap";
                break;
            default:
                $heading2 = "CHAPTER $chap";
                break;
        }

        if ($jst == "JST") {
            $jstTitle = ' (JST)';
            $heading2 .= $jstTitle;
        } else {
            $jstTitle = '';
        }
    }

    print "<div class=\"scripturecontent\" title=\"Scriptures: $citeAbbr $chap$jstTitle\">\n";
    print "<div class=\"chapterheading\">$heading1</div>\n";
    print "<div class=\"navheading\"><div class=\"divtitle\">$heading2</div></div>\n";

    if ($jst == "JST" && $book == "song") {
        print "<blockquote class=\"scripturenote\">Note: the JST manuscript states that " .
              "\"The Songs of Solomon are not inspired writings\"." .
              "</blockquote>\n";
    } else {
        displayVerses($parent, $bookAbbr, $chap, $verse_list, $jstnumchap, $jst, $citeAbbr);
    }

    print "<div class=\"navspace\"></div>\n";
    print "<div class=\"navheading\"></div>\n";
    print "</div>\n";
}

function displayVerses($parent, $book, $chap, $verses, $jstnumchap, $jst, $citeAbbr) {
    /*
     * Split verses by commas.
     * For each comma group:
     *     Find first and last number of range.
     *     For each verse in range:
     *         Display verse.
     */
    $verse_list = ' ';
    $verse_ranges = explode(',', $verses);
    foreach ($verse_ranges as $range) {
        list($first, $last) = explode("-", $range);
        if ($last == '') {
            $last = $first;
        }
        for ($i = $first; $i <= $last; $i++) {
            $verse_list .= $i . ' ';
        }
    }

    formatVerses($parent, $book, $chap, $verse_list, $jstnumchap, $jst, $citeAbbr);
}

function formatVerses($parent, $book, $chap, $verses, $jstnumchap, $jst, $citeAbbr) {
    global $db;

    $uriHead = str_replace(' ', '', $book) . "_$chap";

    $book = str_replace(' ', '_', $book);
    if ($jst == 'JST') {
        $queryBook = $book . '_JST';
    } else {
        $queryBook = $book;
    }

    $query = 'SELECT s.Id, s.Verse, s.Context, s.BookHeader ' .
             'FROM scriptures s ' .
             "WHERE s.BookAbbr='$queryBook' AND s.Chapter=$chap " .
             'ORDER BY s.Verse';
    $result = $db->query($query);

    if ($result->numRows() > 0) {
        print "<ul class=\"versesblock\">\n";
        while (list($verseId, $verse, $text, $header) = $result->fetchRow()) {
            // Look up geolocation layer for this verse and mark up if needed
            $query2 = 'SELECT p.Id, p.Placename, p.Latitude, p.Longitude, ' .
                             'p.viewLatitude, p.viewLongitude, p.viewTilt, ' .
                             'p.viewRoll, p.viewAltitude, p.viewHeading ' .
                      'FROM geotag g JOIN geoplace p ' .
                      'WHERE g.GeoplaceId=p.Id AND ' .
                      "g.ScripturesId=$verseId " .
                      'ORDER BY LENGTH(p.Placename) DESC';
            $result2 = $db->query($query2);

            if ($result2->numRows() > 0) {
                $patterns = array();
                $replacements = array();
                $patterns2 = array();
                $replacements2 = array();
                // $i = 0;

                while (list($geotagId, $placename, $latitude, $longitude, $viewLatitude, $viewLongitude,
                            $viewTilt, $viewRoll, $viewAltitude, $viewHeading) = $result2->fetchRow()) {
                    // This regex has a really fancy feature: negative look-ahead assertion.  I'm checking
                    // to ensure that the match doesn't happen if it is wrapped inside an HTML tag.
                    // In other words, if the match is followed by a closing html tag, as indicated by </
                    // without an intervening opening tag <..., then we exclude the match.  ?! means
                    // exclude the match if the following expression matches.  So here's a match that works:
                    //
                    // Looking for: /Sinai/i
                    // In string:   ... mount Sinai, the <b>LORD</b> ...
                    //
                    // This matches because the pattern [^<]*<\/ does not match after Sinai.  Why?  The
                    // opening tag <b> fails the match.  [^<]* indicates a sequence of characters that are
                    // not <.  But <b> starts with <, so the match fails.  So ?![^<]*<\/ is true, and the
                    // match is allowed.  Here's a match that doesn't work:
                    //
                    // Looking for: /Sinai/i
                    // In string: ... <a ...>mount Sinai</a>, the <b>LORD</b> ...
                    //
                    // This fails to match because </a> DOES satisfy the regex [^<]*<\/.  * means 0 or more
                    // of the thing to the left.  So we take 0.  Now <\/ matches the beginning of </a>, and
                    // so the asserted expression exists.  Since we've asked for it NOT to exist, ?!, then
                    // we exclude this match of Sinai.
                    //
                    // You can do a positive look-ahead assertion with ?= instead of ?!.  Positive means only
                    // accept the match if you DO find the asserted expression after the match.
                    array_push($patterns, "/\\b(" . str_replace("’", ".{1,3}", $placename) . ")(?![^<]*<\/)/i");

                    if ($viewLatitude != '') {
                        $viewParameters = ",${viewLatitude},${viewLongitude},${viewTilt}," .
                                          "${viewRoll},${viewAltitude},${viewHeading}";
                    } else {
                        $viewParameters = '';
                    }

                    array_push($replacements,
                               '<a href="javascript:void(0);" onclick="showLocation(' .
                               "${geotagId},'${placename}',${latitude},${longitude}${viewParameters}" .
                               ')">${1}</a>');
                }

                $text = preg_replace($patterns, $replacements, $text);

                $result2->free();
            }

            if ($header == 'H') {
                $class = 'sectionHeader';
            } else {
                $class = '';
            }

            if (strpos($verses, " $verse ") !== false &&
                $book != 'od') {
                if ($class == '') {
                    $class = 'match';
                } else {
                    $class .= ' match';
                }
            }

            if ($class != '') {
                $class = " class=\"$class\"";
            }

            $id = "id=\"${uriHead}.$verse\"";

            if ($verse <= 0 || $verse >= 1000) {
                print "<li $id$class>$text</li>\n";
            } else {
                print "<li $id$class><span class=\"verse\">$verse</span> $text</li>\n";
            }
        }

        $result->free();
        print "</ul>\n";
    }
}

function isSupplementary($key) {
    return ($key == "201" || $key == "202" || $key == "203" || $key == "204" || $key == "301");
}

    $book = $_REQUEST['book'];      // Target book abbreviation
    $chap = $_REQUEST['chap'];      // Target chapter number
    $verses = $_REQUEST['verses'];  // Target verses to highlight
    $jst = $_REQUEST['jst'];        // Request JST version

    header('Content-Type: text/html, charset=utf-8');
    header("Access-Control-Allow-Origin: *");
    require_once("/var/include/mapscrip/openmapdb.inc");

    print '<div class="scripturewrapper">';
    if ($chap == "") {
        $chap = 0;
    }

    $verses = str_replace('%23', '#', $verses);
    $verses = str_replace("/", "", $verses);
    $verses = preg_replace("/#[0-9]+/", "", $verses);

    $result = $db->query("SET NAMES 'utf8'");

    $query = "SELECT URLPath, Parent FROM books WHERE Sequence = '$book'";
    $result = $db->query($query);
    if ($result->numRows() > 0) {
        list($path, $parent) = $result->fetchRow();
        $result->free();
    }


    displayChapter($book, $chap, $verses, $jst);

    $db->disconnect();
?>
