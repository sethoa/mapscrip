// JSLint directives
/*property
    LatLngBounds, Marker, abbr, animate, appendTo, attr, backName, bookById,
    books, citeAbbr, citeFull, click, complete, css, duration, each, error,
    exec, extend, fitBounds, forEach, fullName, get, getAttribute, getCenter,
    getPosition, getTitle, gridName, html, id, jstTitle, lat, length, lng, log,
    map, maps, maxBookId, minBookId, navigateBook, navigateChapter,
    navigateHome, navigateVolumeBook, nextChapter, numChapters, opacity, panTo,
    parentBookId, position, prevChapter, push, queue, remove, round, setMap,
    setZoom, showLocation, slice, subdiv, success, target, title, tocName,
    urlForScriptureChapter, urlPath, volumes, webTitle
*/
/*jslint browser: true */
/*global  $, map, console, google */

var Scriptures = (function () {
    // Force the browser into JavaScript strict compliance mode.
    'use strict';

    /*------------------------------------------------------------------------
     *                      CONSTANTS
     */
    // Default animation duration.
    var ANIMATION_DURATION = 700;

    // Regular expression complete with capture groups to parse a lat/lon
    // structure in an anchor tag for our scriptures format.
    var LAT_LON_PARSER = /\((.*),'(.*)',(.*),(.*),(.*),(.*),(.*),(.*),(.*),(.*)\)/;

    // URL to retrieve scriptures
    var SCRIPTURES_URL = 'http://scriptures.byu.edu/mapscrip/mapgetscrip.php';

    /*------------------------------------------------------------------------
     *                      PRIVATE VARIABLES
     */
    // Main data structure of all book objects.
    var books;

    // Markers associated with the Google Map for the current chapter.
    var gmMarkers = [];

    // HTML for next/previous navigation links for the current chapter.
    var nextPrevLink = '';

    // Breadcrumbs for requested scripture content.
    var requestedCrumbs;

    // Array of top-level volumes.
    var volumeArray;

    // This is our internal module name for the object that we will return to
    // deliver the public interface of this Scriptures package.
    var publicInterface = {};

    /*------------------------------------------------------------------------
     *                      PRIVATE METHODS
     */
    var breadcrumbs = function (volume, book, chapter) {
        var crumbs;

        if (volume === undefined) {
            crumbs = '<ul><li>The Scriptures</li>';
        } else {
            crumbs = '<ul><li><a href="javascript:void(0);" onclick="Scriptures.navigateHome()">The Scriptures</a></li>';

            if (book === undefined) {
                crumbs += '<li>' + volume.fullName + '</li>';
            } else {
                crumbs += '<li><a href="javascript:void(0);" onclick="Scriptures.navigateHome(' +
                        volume.id + ')">' + volume.fullName + '</a></li>';

                if (chapter === undefined) {
                    crumbs += '<li>' + book.tocName + '</li>';
                } else {
                    crumbs += '<li><a href="javascript:void(0);" onclick="Scriptures.navigateBook(' +
                            book.id + ')">' + book.tocName + '</a></li>';
                    crumbs += '<li>' + chapter + '</li>';
                }
            }
        }

        return crumbs + '</ul>';
    };

    var clearMarkers = function () {
        // Clear array of current markers
        gmMarkers.forEach(function (marker) {
            marker.setMap(null);
        });

        gmMarkers.length = 0;
    };

    var encodedScriptureUrlParameters = function (bookId, chapter, verses, isJst) {
        // bookId and chapter are required but verses and isJst are optional
        var options = '';

        if (bookId !== undefined && chapter !== undefined) {
            if (verses !== undefined) {
                options += verses;
            }

            if (isJst !== undefined && isJst) {
                options += '&jst=JST';
            }

            return SCRIPTURES_URL + '?book=' + bookId + '&chap=' + chapter + '&verses=' + options;
        }
    };

    var markerExists = function (placename, latitude, longitude) {
        var i = gmMarkers.length - 1;
        var marker;

        while (i >= 0) {
            marker = gmMarkers[i];

            // Note: here is the safe way to compare IEEE floating-point
            // numbers: compare their difference to a small number
            if (marker.getTitle() === placename &&
                    marker.getPosition().lat - latitude < 0.0000001 &&
                    marker.getPosition().lng - longitude < 0.0000001) {
                return true;
            }

            i -= 1;
        }

        return false;
    };

    var setupMarkers = function () {
        var bounds;
        var latitude;
        var longitude;
        var matches;
        var marker;
        var placename;
        var value;
        var zoomFactor = 400;

        if (gmMarkers.length > 0) {
            clearMarkers();
        }

        $('a[onclick^="showLocation("]').each(function () {
            value = arguments[1].getAttribute('onclick');

            matches = LAT_LON_PARSER.exec(value);

            if (matches) {
                placename = matches[2];
                latitude = parseFloat(matches[3]);
                longitude = parseFloat(matches[4]);

                if (!markerExists(placename, latitude, longitude)) {
                    marker = new google.maps.Marker({
                        position: {lat: Number(latitude), lng: Number(longitude)},
                        map: map,
                        title: placename
                    });

                    gmMarkers.push(marker);
                }
            }
        });

        if (gmMarkers.length > 0) {
            if (gmMarkers.length === 1 && matches) {
                // When there's exactly one marker, add it and zoom to it
                map.setZoom(Math.round(Number(matches[9]) / zoomFactor));
                map.panTo(gmMarkers[0].position);
            } else {
                bounds = new google.maps.LatLngBounds();

                gmMarkers.forEach(function (marker) {
                    bounds.extend(marker.position);
                });

                map.panTo(bounds.getCenter());
                map.fitBounds(bounds);
            }
        }
    };

    var transitionBreadcrumbs = function (newCrumbs) {
        // Use cross-dissolve transition, non-directional
        var crumbs = $('#header #crumb ul');

        if (newCrumbs === undefined) {
            newCrumbs = $(requestedCrumbs);
        } else {
            newCrumbs = $(newCrumbs);
        }

        crumbs.animate({
            opacity: 0  // Fade out the current breadcrumbs
        }, {
            queue: false,
            duration: 1000,
            complete: function () {
                crumbs.remove();
            }
        });

        newCrumbs.css({opacity: 0}).appendTo('#crumb');
        newCrumbs.animate({
            opacity: 1  // Fade in the new breadcrumbs
        }, {
            queue: false,
            duration: 1000
        });
    };

    var transitionScriptures = function (content) {
        // Use cross-dissolve transition, non-directional
        var outdiv = $('#scripnav');

        if (outdiv.length <= 0) {
            outdiv = $('.scripturewrapper');
        }

        outdiv.animate({
            opacity: 0
        }, {
            queue: false,
            duration: 1000,
            complete: function () {
                outdiv.remove();
            }
        });

        content.css({opacity: 0}).appendTo('#scriptures');
        content.animate({
            opacity: 1
        }, {
            queue: false,
            duration: 1000
        });

        setupMarkers();
    };

    /*------------------------------------------------------------------------
     *                      PRIVATE METHODS WITH DEPENDENCIES
     */
    var getScriptureCallback = function (html) {
        html = $(html);
        html.find('.navheading').append('<div class="nextprev">' + nextPrevLink + '</div>'); 

        transitionBreadcrumbs();
        transitionScriptures(html);
    };

    var getScriptureFailed = function () {
        console.log("Warning: scripture request from server failed");
    };

    /*------------------------------------------------------------------------
     *                      PUBLIC METHODS
     */
    publicInterface.bookById = function (id) {
        // Note that we'd need to return a clone of the book object if we
        // wanted to guarantee read-only encapsulation.  As it is here,
        // the client could change the book object if they wish, and our
        // copy would change too.
        return books[id];
    };

    publicInterface.nextChapter = function (bookId, chapter) {
        var book = publicInterface.bookById(bookId);
        var nextBook = {};
        var nextChapter = 0;

        if (book !== undefined) {
            if (chapter < book.numChapters) {
                return [bookId, chapter + 1];
            }

            nextBook = publicInterface.bookById(bookId + 1);

            if (nextBook !== undefined) {
                if (nextBook.numChapters > 0) {
                    nextChapter = 1;
                }

                return [nextBook.id, nextChapter];
            }
        }
    };

    publicInterface.prevChapter = function (bookId, chapter) {
        var book = publicInterface.bookById(bookId);
        var prevBook = {};

        if (book !== undefined) {
            if (chapter > 1) {
                return [bookId, chapter - 1];
            }

            prevBook = publicInterface.bookById(bookId - 1);

            if (prevBook !== undefined) {
                return [prevBook.id, prevBook.numChapters];
            }
        }
    };

    publicInterface.volumes = function () {
        // Return a copy of the array for slightly improved encapsulation.
        return volumeArray.slice();
    };

    publicInterface.urlForScriptureChapter = function (bookId, chapter, verses, isJst) {
        // Note that bookId and chapter are required, but verses and isJst are optional.
        var book = publicInterface.bookById(bookId);

        if (book !== undefined) {
            if ((chapter === 0 && book.numChapters === 0) ||
                    (chapter > 0 && chapter <= book.numChapters)) {
                return encodedScriptureUrlParameters(bookId, chapter, verses, isJst);
            }
        }
    };

    /*------------------------------------------------------------------------
     *                      PAGE MANAGEMENT METHODS
     */
    publicInterface.navigateBook = function (bookId) {
        var book = publicInterface.bookById(bookId);
        var volume = publicInterface.volumes()[book.parentBookId - 1];

        publicInterface.navigateVolumeBook(volume, book);
    };

    publicInterface.navigateChapter = function (bookId, chapter) {
        var book;
        var nextPrev;
        var volume;

        if (bookId !== undefined) {
            book = publicInterface.bookById(bookId);
            volume = publicInterface.volumes()[book.parentBookId - 1];

            requestedCrumbs = breadcrumbs(volume, book, chapter);

            nextPrev = publicInterface.prevChapter(bookId, chapter);

            if (nextPrev === undefined) {
                nextPrevLink = '';
            } else {
                nextPrevLink = '<a href="javascript:void(0);" onclick="Scriptures.navigateChapter(' +
                    nextPrev[0] + ', ' + nextPrev[1] + ')"><i class="material-icons">skip_previous</i></a>';
            }

            nextPrev = publicInterface.nextChapter(bookId, chapter);

            if (nextPrev !== undefined) {
                nextPrevLink += '<a href="javascript:void(0);" onclick="Scriptures.navigateChapter(' +
                    nextPrev[0] + ', ' + nextPrev[1] + ')"><i class="material-icons">skip_next</i></a>';
            }

            $.get(publicInterface.urlForScriptureChapter(bookId, chapter))
                .success(getScriptureCallback)
                .error(getScriptureFailed);
        }
    };

    publicInterface.navigateHome = function (volumeId) {
        var displayedVolume;
        var navContents = '<div id="scripnav">';

        publicInterface.volumes().forEach(function (volume) {
            if (volumeId === undefined || volume.id === volumeId) {
                navContents += '<div class="volume"><a name="v' + volume.id + '" /><h5>' +
                        volume.fullName + '</h5></div><div class="books">';

                volume.books.forEach(function (book) {
                    navContents += '<a class="waves-effect waves-custom waves-ripple btn" id="' +
                            book.id + '">' + book.gridName + '</a>';
                });

                navContents += '</div>';
                displayedVolume = volume;
            }
        });

        navContents += '<br/><br/></div>';

        if (volumeId === undefined) {
            displayedVolume = undefined;
        }

        transitionBreadcrumbs(breadcrumbs(displayedVolume));
        transitionScriptures($(navContents));

        $('#scripnav a').click(function (event) {
            var book = publicInterface.bookById($(event.target).attr('id'));
            var volume = publicInterface.volumes()[book.parentBookId - 1];

            publicInterface.navigateVolumeBook(volume, book);
        });
    };

    publicInterface.navigateVolumeBook = function (volume, book) {
        var chapter = 1;
        var crumbs;
        var navContents;

        if (book.numChapters <= 0) {
            publicInterface.navigateChapter(book.id, 0);
        } else if (book.numChapters === 1) {
            publicInterface.navigateChapter(book.id, 1);
        } else {
            crumbs = breadcrumbs(volume, book);
            navContents = '<div id="scripnav"><div class="volume"><h5>' + book.fullName + '</h5></div><div class="books">';

            while (chapter <= book.numChapters) {
                navContents += '<a class="waves-effect waves-custom waves-ripple btn chapter" id="' +
                        chapter + '">' + chapter + '</a>';
                chapter += 1;
            }

            navContents += '</div>';

            transitionBreadcrumbs(crumbs);
            transitionScriptures($(navContents));

            $('#scripnav a').click(function (event) {
                publicInterface.navigateChapter(book.id, Number($(event.target).attr('id')));
            });
        }
    };

    publicInterface.showLocation = function () {
        var latitude = arguments[2];
        var longitude = arguments[3];
        var viewAltitude = arguments[8];

        map.panTo({lat: latitude, lng: longitude});
        map.setZoom(Math.round(viewAltitude / 450));
    };

    /*------------------------------------------------------------------------
     *                      LARGE VARIABLES
     */
    books = {
        '101': {'id': 101,
                'abbr': 'gen',
                'citeAbbr': 'Gen.',
                'fullName': 'Genesis',
                'numChapters': 50,
                'urlPath': 'gen/',
                'parentBookId': 1,
                'webTitle': 'The First Book of Moses Called<br /><b class="big">Genesis</b>',
                'jstTitle': 'NULL',
                'tocName': 'Genesis',
                'subdiv': 'Chapter',
                'backName': 'Genesis',
                'gridName': 'Genesis',
                'citeFull': 'Genesis'},
        '102': {'id': 102,
                'abbr': 'ex',
                'citeAbbr': 'Ex.',
                'fullName': 'Exodus',
                'numChapters': 40,
                'urlPath': 'ex/',
                'parentBookId': 1,
                'webTitle': 'The Second Book of Moses Called<br /><b class="big">Exodus</b>',
                'jstTitle': 'NULL',
                'tocName': 'Exodus',
                'subdiv': 'Chapter',
                'backName': 'Exodus',
                'gridName': 'Exodus',
                'citeFull': 'Exodus'},
        '103': {'id': 103,
                'abbr': 'lev',
                'citeAbbr': 'Lev.',
                'fullName': 'Leviticus',
                'numChapters': 27,
                'urlPath': 'lev/',
                'parentBookId': 1,
                'webTitle': 'The Third Book of Moses Called<br /><b class="big">Leviticus</b>',
                'jstTitle': 'NULL',
                'tocName': 'Leviticus',
                'subdiv': 'Chapter',
                'backName': 'Leviticus',
                'gridName': 'Lev.',
                'citeFull': 'Leviticus'},
        '104': {'id': 104,
                'abbr': 'num',
                'citeAbbr': 'Num.',
                'fullName': 'Numbers',
                'numChapters': 36,
                'urlPath': 'num/',
                'parentBookId': 1,
                'webTitle': 'The Fourth Book of Moses Called<br /><b class="big">Numbers</b>',
                'jstTitle': 'NULL',
                'tocName': 'Numbers',
                'subdiv': 'Chapter',
                'backName': 'Numbers',
                'gridName': 'Num.',
                'citeFull': 'Numbers'},
        '105': {'id': 105,
                'abbr': 'deut',
                'citeAbbr': 'Deut.',
                'fullName': 'Deuteronomy',
                'numChapters': 34,
                'urlPath': 'deut/',
                'parentBookId': 1,
                'webTitle': 'The Fifth Book of Moses Called<br /><b class="big">Deuteronomy</b>',
                'jstTitle': 'NULL',
                'tocName': 'Deut.',
                'subdiv': 'Chapter',
                'backName': 'Deut.',
                'gridName': 'Deut.',
                'citeFull': 'Deuteronomy'},
        '106': {'id': 106,
                'abbr': 'josh',
                'citeAbbr': 'Josh.',
                'fullName': 'Joshua',
                'numChapters': 24,
                'urlPath': 'josh/',
                'parentBookId': 1,
                'webTitle': 'The Book of<br /><b class="big">Joshua</b>',
                'jstTitle': 'NULL',
                'tocName': 'Joshua',
                'subdiv': 'Chapter',
                'backName': 'Joshua',
                'gridName': 'Joshua',
                'citeFull': 'Joshua'},
        '107': {'id': 107,
                'abbr': 'judg',
                'citeAbbr': 'Judg.',
                'fullName': 'Judges',
                'numChapters': 21,
                'urlPath': 'judg/',
                'parentBookId': 1,
                'webTitle': 'The Book of<br /><b class="big">Judges</b>',
                'jstTitle': 'NULL',
                'tocName': 'Judges',
                'subdiv': 'Chapter',
                'backName': 'Judges',
                'gridName': 'Judges',
                'citeFull': 'Judges'},
        '108': {'id': 108,
                'abbr': 'ruth',
                'citeAbbr': 'Ruth',
                'fullName': 'Ruth',
                'numChapters': 4,
                'urlPath': 'ruth/',
                'parentBookId': 1,
                'webTitle': 'The Book of<br /><b class="big">Ruth</b>',
                'jstTitle': 'NULL',
                'tocName': 'Ruth',
                'subdiv': 'Chapter',
                'backName': 'Ruth',
                'gridName': 'Ruth',
                'citeFull': 'Ruth'},
        '109': {'id': 109,
                'abbr': '1 sam',
                'citeAbbr': '1 Sam.',
                'fullName': '1 Samuel',
                'numChapters': 31,
                'urlPath': '1_sam/',
                'parentBookId': 1,
                'webTitle': 'The First Book of<br /><b class="big">Samuel</b><br />Otherwise Called The First Book of the Kings',
                'jstTitle': 'NULL',
                'tocName': '1 Samuel',
                'subdiv': 'Chapter',
                'backName': '1 Samuel',
                'gridName': '1 Sam.',
                'citeFull': '1 Samuel'},
        '110': {'id': 110,
                'abbr': '2 sam',
                'citeAbbr': '2 Sam.',
                'fullName': '2 Samuel',
                'numChapters': 24,
                'urlPath': '2_sam/',
                'parentBookId': 1,
                'webTitle': 'The Second Book of<br /><b class="big">Samuel</b><br />Otherwise Called The Second Book of the Kings',
                'jstTitle': 'NULL',
                'tocName': '2 Samuel',
                'subdiv': 'Chapter',
                'backName': '2 Samuel',
                'gridName': '2 Sam.',
                'citeFull': '2 Samuel'},
        '111': {'id': 111,
                'abbr': '1 kgs',
                'citeAbbr': '1 Kgs.',
                'fullName': '1 Kings',
                'numChapters': 22,
                'urlPath': '1_kgs/',
                'parentBookId': 1,
                'webTitle': 'The First Book of the<br /><b class="big">Kings</b><br />Commonly Called The Third Book of the Kings',
                'jstTitle': 'NULL',
                'tocName': '1 Kings',
                'subdiv': 'Chapter',
                'backName': '1 Kings',
                'gridName': '1 Kings',
                'citeFull': '1 Kings'},
        '112': {'id': 112,
                'abbr': '2 kgs',
                'citeAbbr': '2 Kgs.',
                'fullName': '2 Kings',
                'numChapters': 25,
                'urlPath': '2_kgs/',
                'parentBookId': 1,
                'webTitle': 'The Second Book of the<br /><b class="big">Kings</b><br />Commonly Called The Fourth Book of the Kings',
                'jstTitle': 'NULL',
                'tocName': '2 Kings',
                'subdiv': 'Chapter',
                'backName': '2 Kings',
                'gridName': '2 Kings',
                'citeFull': '2 Kings'},
        '113': {'id': 113,
                'abbr': '1 chr',
                'citeAbbr': '1 Chr.',
                'fullName': '1 Chronicles',
                'numChapters': 29,
                'urlPath': '1_chr/',
                'parentBookId': 1,
                'webTitle': 'The First Book of the<br /><b class="big">Chronicles</b>',
                'jstTitle': 'NULL',
                'tocName': '1 Chronicles',
                'subdiv': 'Chapter',
                'backName': '1 Chronicles',
                'gridName': '1 Chron.',
                'citeFull': '1 Chronicles'},
        '114': {'id': 114,
                'abbr': '2 chr',
                'citeAbbr': '2 Chr.',
                'fullName': '2 Chronicles',
                'numChapters': 36,
                'urlPath': '2_chr/',
                'parentBookId': 1,
                'webTitle': 'The Second Book of the<br /><b class="big">Chronicles</b>',
                'jstTitle': 'NULL',
                'tocName': '2 Chronicles',
                'subdiv': 'Chapter',
                'backName': '2 Chronicles',
                'gridName': '2 Chron.',
                'citeFull': '2 Chronicles'},
        '115': {'id': 115,
                'abbr': 'ezra',
                'citeAbbr': 'Ezra',
                'fullName': 'Ezra',
                'numChapters': 10,
                'urlPath': 'ezra/',
                'parentBookId': 1,
                'webTitle': '<b class="big">Ezra</b>',
                'jstTitle': 'NULL',
                'tocName': 'Ezra',
                'subdiv': 'Chapter',
                'backName': 'Ezra',
                'gridName': 'Ezra',
                'citeFull': 'Ezra'},
        '116': {'id': 116,
                'abbr': 'neh',
                'citeAbbr': 'Neh.',
                'fullName': 'Nehemiah',
                'numChapters': 13,
                'urlPath': 'neh/',
                'parentBookId': 1,
                'webTitle': 'The Book of<br /><b class="big">Nehemiah</b>',
                'jstTitle': 'NULL',
                'tocName': 'Nehemiah',
                'subdiv': 'Chapter',
                'backName': 'Nehemiah',
                'gridName': 'Neh.',
                'citeFull': 'Nehemiah'},
        '117': {'id': 117,
                'abbr': 'esth',
                'citeAbbr': 'Esth.',
                'fullName': 'Esther',
                'numChapters': 10,
                'urlPath': 'esth/',
                'parentBookId': 1,
                'webTitle': 'The Book of<br /><b class="big">Esther</b>',
                'jstTitle': 'NULL',
                'tocName': 'Esther',
                'subdiv': 'Chapter',
                'backName': 'Esther',
                'gridName': 'Esther',
                'citeFull': 'Esther'},
        '118': {'id': 118,
                'abbr': 'job',
                'citeAbbr': 'Job',
                'fullName': 'Job',
                'numChapters': 42,
                'urlPath': 'job/',
                'parentBookId': 1,
                'webTitle': 'The Book of<br /><b class="big">Job</b>',
                'jstTitle': 'NULL',
                'tocName': 'Job',
                'subdiv': 'Chapter',
                'backName': 'Job',
                'gridName': 'Job',
                'citeFull': 'Job'},
        '119': {'id': 119,
                'abbr': 'ps',
                'citeAbbr': 'Ps.',
                'fullName': 'Psalms',
                'numChapters': 150,
                'urlPath': 'ps/',
                'parentBookId': 1,
                'webTitle': 'The Book of<br /><b class="big">Psalms</b>',
                'jstTitle': 'NULL',
                'tocName': 'Psalms',
                'subdiv': 'Psalm',
                'backName': 'Psalm',
                'gridName': 'Psalms',
                'citeFull': 'Psalms'},
        '120': {'id': 120,
                'abbr': 'prov',
                'citeAbbr': 'Prov.',
                'fullName': 'Proverbs',
                'numChapters': 31,
                'urlPath': 'prov/',
                'parentBookId': 1,
                'webTitle': '<b class="big">The Proverbs</b>',
                'jstTitle': 'NULL',
                'tocName': 'Proverbs',
                'subdiv': 'Chapter',
                'backName': 'Proverbs',
                'gridName': 'Prov.',
                'citeFull': 'Proverbs'},
        '121': {'id': 121,
                'abbr': 'eccl',
                'citeAbbr': 'Eccl.',
                'fullName': 'Ecclesiastes',
                'numChapters': 12,
                'urlPath': 'eccl/',
                'parentBookId': 1,
                'webTitle': '<b class="big">Ecclesiastes</b><br />Or, The Preacher',
                'jstTitle': 'NULL',
                'tocName': 'Ecclesiastes',
                'subdiv': 'Chapter',
                'backName': 'Ecclesiastes',
                'gridName': 'Eccl.',
                'citeFull': 'Ecclesiastes'},
        '122': {'id': 122,
                'abbr': 'song',
                'citeAbbr': 'Song',
                'fullName': 'The Song of Solomon',
                'numChapters': 8,
                'urlPath': 'song/',
                'parentBookId': 1,
                'webTitle': 'The<br /><b class="big">Song of Solomon</b>',
                'jstTitle': 'NULL',
                'tocName': 'Song of Sol.',
                'subdiv': 'Chapter',
                'backName': 'Song of Sol.',
                'gridName': 'Song.',
                'citeFull': 'Song of Sol.'},
        '123': {'id': 123,
                'abbr': 'isa',
                'citeAbbr': 'Isa.',
                'fullName': 'Isaiah',
                'numChapters': 66,
                'urlPath': 'isa/',
                'parentBookId': 1,
                'webTitle': 'The Book of the Prophet<br /><b class="big">Isaiah</b>',
                'jstTitle': 'NULL',
                'tocName': 'Isaiah',
                'subdiv': 'Chapter',
                'backName': 'Isaiah',
                'gridName': 'Isaiah',
                'citeFull': 'Isaiah'},
        '124': {'id': 124,
                'abbr': 'jer',
                'citeAbbr': 'Jer.',
                'fullName': 'Jeremiah',
                'numChapters': 52,
                'urlPath': 'jer/',
                'parentBookId': 1,
                'webTitle': 'The Book of the Prophet<br /><b class="big">Jeremiah</b>',
                'jstTitle': 'NULL',
                'tocName': 'Jeremiah',
                'subdiv': 'Chapter',
                'backName': 'Jeremiah',
                'gridName': 'Jer.',
                'citeFull': 'Jeremiah'},
        '125': {'id': 125,
                'abbr': 'lam',
                'citeAbbr': 'Lam.',
                'fullName': 'Lamentations',
                'numChapters': 5,
                'urlPath': 'lam/',
                'parentBookId': 1,
                'webTitle': 'The<br /><b class="big">Lamentations</b><br />of Jeremiah',
                'jstTitle': 'NULL',
                'tocName': 'Lamentations',
                'subdiv': 'Chapter',
                'backName': 'Lamentations',
                'gridName': 'Lam.',
                'citeFull': 'Lamentations'},
        '126': {'id': 126,
                'abbr': 'ezek',
                'citeAbbr': 'Ezek.',
                'fullName': 'Ezekiel',
                'numChapters': 48,
                'urlPath': 'ezek/',
                'parentBookId': 1,
                'webTitle': 'The Book of the Prophet<br /><b class="big">Ezekiel</b>',
                'jstTitle': 'NULL',
                'tocName': 'Ezekiel',
                'subdiv': 'Chapter',
                'backName': 'Ezekiel',
                'gridName': 'Ezekiel',
                'citeFull': 'Ezekiel'},
        '127': {'id': 127,
                'abbr': 'dan',
                'citeAbbr': 'Dan.',
                'fullName': 'Daniel',
                'numChapters': 12,
                'urlPath': 'dan/',
                'parentBookId': 1,
                'webTitle': 'The Book of<br /><b class="big">Daniel</b>',
                'jstTitle': 'NULL',
                'tocName': 'Daniel',
                'subdiv': 'Chapter',
                'backName': 'Daniel',
                'gridName': 'Daniel',
                'citeFull': 'Daniel'},
        '128': {'id': 128,
                'abbr': 'hosea',
                'citeAbbr': 'Hosea',
                'fullName': 'Hosea',
                'numChapters': 14,
                'urlPath': 'hosea/',
                'parentBookId': 1,
                'webTitle': '<b class="big">Hosea</b>',
                'jstTitle': 'NULL',
                'tocName': 'Hosea',
                'subdiv': 'Chapter',
                'backName': 'Hosea',
                'gridName': 'Hosea',
                'citeFull': 'Hosea'},
        '129': {'id': 129,
                'abbr': 'joel',
                'citeAbbr': 'Joel',
                'fullName': 'Joel',
                'numChapters': 3,
                'urlPath': 'joel/',
                'parentBookId': 1,
                'webTitle': '<b class="big">Joel</b>',
                'jstTitle': 'NULL',
                'tocName': 'Joel',
                'subdiv': 'Chapter',
                'backName': 'Joel',
                'gridName': 'Joel',
                'citeFull': 'Joel'},
        '130': {'id': 130,
                'abbr': 'amos',
                'citeAbbr': 'Amos',
                'fullName': 'Amos',
                'numChapters': 9,
                'urlPath': 'amos/',
                'parentBookId': 1,
                'webTitle': '<b class="big">Amos</b>',
                'jstTitle': 'NULL',
                'tocName': 'Amos',
                'subdiv': 'Chapter',
                'backName': 'Amos',
                'gridName': 'Amos',
                'citeFull': 'Amos'},
        '131': {'id': 131,
                'abbr': 'obad',
                'citeAbbr': 'Obad.',
                'fullName': 'Obadiah',
                'numChapters': 1,
                'urlPath': 'obad/',
                'parentBookId': 1,
                'webTitle': '<b class="big">Obadiah</b>',
                'jstTitle': 'NULL',
                'tocName': 'Obadiah',
                'subdiv': 'Chapter',
                'backName': 'Obadiah',
                'gridName': 'Obadiah',
                'citeFull': 'Obadiah'},
        '132': {'id': 132,
                'abbr': 'jonah',
                'citeAbbr': 'Jonah',
                'fullName': 'Jonah',
                'numChapters': 4,
                'urlPath': 'jonah/',
                'parentBookId': 1,
                'webTitle': '<b class="big">Jonah</b>',
                'jstTitle': 'NULL',
                'tocName': 'Jonah',
                'subdiv': 'Chapter',
                'backName': 'Jonah',
                'gridName': 'Jonah',
                'citeFull': 'Jonah'},
        '133': {'id': 133,
                'abbr': 'micah',
                'citeAbbr': 'Micah',
                'fullName': 'Micah',
                'numChapters': 7,
                'urlPath': 'micah/',
                'parentBookId': 1,
                'webTitle': '<b class="big">Micah</b>',
                'jstTitle': 'NULL',
                'tocName': 'Micah',
                'subdiv': 'Chapter',
                'backName': 'Micah',
                'gridName': 'Micah',
                'citeFull': 'Micah'},
        '134': {'id': 134,
                'abbr': 'nahum',
                'citeAbbr': 'Nahum',
                'fullName': 'Nahum',
                'numChapters': 3,
                'urlPath': 'nahum/',
                'parentBookId': 1,
                'webTitle': '<b class="big">Nahum</b>',
                'jstTitle': 'NULL',
                'tocName': 'Nahum',
                'subdiv': 'Chapter',
                'backName': 'Nahum',
                'gridName': 'Nahum',
                'citeFull': 'Nahum'},
        '135': {'id': 135,
                'abbr': 'hab',
                'citeAbbr': 'Hab.',
                'fullName': 'Habakkuk',
                'numChapters': 3,
                'urlPath': 'hab/',
                'parentBookId': 1,
                'webTitle': '<b class="big">Habakkuk</b>',
                'jstTitle': 'NULL',
                'tocName': 'Habakkuk',
                'subdiv': 'Chapter',
                'backName': 'Habakkuk',
                'gridName': 'Hab.',
                'citeFull': 'Habakkuk'},
        '136': {'id': 136,
                'abbr': 'zeph',
                'citeAbbr': 'Zeph.',
                'fullName': 'Zephaniah',
                'numChapters': 3,
                'urlPath': 'zeph/',
                'parentBookId': 1,
                'webTitle': '<b class="big">Zephaniah</b>',
                'jstTitle': 'NULL',
                'tocName': 'Zephaniah',
                'subdiv': 'Chapter',
                'backName': 'Zephaniah',
                'gridName': 'Zeph.',
                'citeFull': 'Zephaniah'},
        '137': {'id': 137,
                'abbr': 'hag',
                'citeAbbr': 'Hag.',
                'fullName': 'Haggai',
                'numChapters': 2,
                'urlPath': 'hag/',
                'parentBookId': 1,
                'webTitle': '<b class="big">Haggai</b>',
                'jstTitle': 'NULL',
                'tocName': 'Haggai',
                'subdiv': 'Chapter',
                'backName': 'Haggai',
                'gridName': 'Haggai',
                'citeFull': 'Haggai'},
        '138': {'id': 138,
                'abbr': 'zech',
                'citeAbbr': 'Zech.',
                'fullName': 'Zechariah',
                'numChapters': 14,
                'urlPath': 'zech/',
                'parentBookId': 1,
                'webTitle': '<b class="big">Zechariah</b>',
                'jstTitle': 'NULL',
                'tocName': 'Zechariah',
                'subdiv': 'Chapter',
                'backName': 'Zechariah',
                'gridName': 'Zech.',
                'citeFull': 'Zechariah'},
        '139': {'id': 139,
                'abbr': 'mal',
                'citeAbbr': 'Mal.',
                'fullName': 'Malachi',
                'numChapters': 4,
                'urlPath': 'mal/',
                'parentBookId': 1,
                'webTitle': '<b class="big">Malachi</b>',
                'jstTitle': 'NULL',
                'tocName': 'Malachi',
                'subdiv': 'Chapter',
                'backName': 'Malachi',
                'gridName': 'Malachi',
                'citeFull': 'Malachi'},
        '140': {'id': 140,
                'abbr': 'matt',
                'citeAbbr': 'Matt.',
                'fullName': 'Matthew',
                'numChapters': 28,
                'urlPath': 'matt/',
                'parentBookId': 2,
                'webTitle': 'The Gospel According to<br /><b class="big">St. Matthew</b>',
                'jstTitle': 'The Testimony of<br /><b class="big">St. Matthew</b>',
                'tocName': 'Matthew',
                'subdiv': 'Chapter',
                'backName': 'Matthew',
                'gridName': 'Matt.',
                'citeFull': 'Matthew'},
        '141': {'id': 141,
                'abbr': 'mark',
                'citeAbbr': 'Mark',
                'fullName': 'Mark',
                'numChapters': 16,
                'urlPath': 'mark/',
                'parentBookId': 2,
                'webTitle': 'The Gospel According to<br /><b class="big">St. Mark</b>',
                'jstTitle': 'The Testimony of<br /><b class="big">St. Mark</b>',
                'tocName': 'Mark',
                'subdiv': 'Chapter',
                'backName': 'Mark',
                'gridName': 'Mark',
                'citeFull': 'Mark'},
        '142': {'id': 142,
                'abbr': 'luke',
                'citeAbbr': 'Luke',
                'fullName': 'Luke',
                'numChapters': 24,
                'urlPath': 'luke/',
                'parentBookId': 2,
                'webTitle': 'The Gospel According to<br /><b class="big">St. Luke</b>',
                'jstTitle': 'The Testimony of<br /><b class="big">St. Luke</b>',
                'tocName': 'Luke',
                'subdiv': 'Chapter',
                'backName': 'Luke',
                'gridName': 'Luke',
                'citeFull': 'Luke'},
        '143': {'id': 143,
                'abbr': 'john',
                'citeAbbr': 'John',
                'fullName': 'John',
                'numChapters': 21,
                'urlPath': 'john/',
                'parentBookId': 2,
                'webTitle': 'The Gospel According to<br /><b class="big">St. John</b>',
                'jstTitle': 'The Testimony of<br /><b class="big">St. John</b>',
                'tocName': 'John',
                'subdiv': 'Chapter',
                'backName': 'John',
                'gridName': 'John',
                'citeFull': 'John'},
        '144': {'id': 144,
                'abbr': 'acts',
                'citeAbbr': 'Acts',
                'fullName': 'The Acts',
                'numChapters': 28,
                'urlPath': 'acts/',
                'parentBookId': 2,
                'webTitle': '<b class="big">The Acts<br />of the Apostles</b>',
                'jstTitle': 'NULL',
                'tocName': 'Acts',
                'subdiv': 'Chapter',
                'backName': 'Acts',
                'gridName': 'Acts',
                'citeFull': 'Acts'},
        '145': {'id': 145,
                'abbr': 'rom',
                'citeAbbr': 'Rom.',
                'fullName': 'The Epistle to the Romans',
                'numChapters': 16,
                'urlPath': 'rom/',
                'parentBookId': 2,
                'webTitle': 'The Epistle of Paul the Apostle to the<br /><b class="big">Romans</b>',
                'jstTitle': 'NULL',
                'tocName': 'Romans',
                'subdiv': 'Chapter',
                'backName': 'Romans',
                'gridName': 'Romans',
                'citeFull': 'Romans'},
        '146': {'id': 146,
                'abbr': '1 cor',
                'citeAbbr': '1 Cor.',
                'fullName': '1 Corinthians',
                'numChapters': 16,
                'urlPath': '1_cor/',
                'parentBookId': 2,
                'webTitle': 'The First Epistle of Paul the Apostle to the<br /><b class="big">Corinthians</b>',
                'jstTitle': 'NULL',
                'tocName': '1 Corinthians',
                'subdiv': 'Chapter',
                'backName': '1 Corinthians',
                'gridName': '1 Cor.',
                'citeFull': '1 Corinthians'},
        '147': {'id': 147,
                'abbr': '2 cor',
                'citeAbbr': '2 Cor.',
                'fullName': '2 Corinthians',
                'numChapters': 13,
                'urlPath': '2_cor/',
                'parentBookId': 2,
                'webTitle': 'The Second Epistle of Paul the Apostle to the<br /><b class="big">Corinthians</b>',
                'jstTitle': 'NULL',
                'tocName': '2 Corinthians',
                'subdiv': 'Chapter',
                'backName': '2 Corinthians',
                'gridName': '2 Cor.',
                'citeFull': '2 Corinthians'},
        '148': {'id': 148,
                'abbr': 'gal',
                'citeAbbr': 'Gal.',
                'fullName': 'Galatians',
                'numChapters': 6,
                'urlPath': 'gal/',
                'parentBookId': 2,
                'webTitle': 'The Epistle of Paul the Apostle to the<br /><b class="big">Galatians</b>',
                'jstTitle': 'NULL',
                'tocName': 'Galatians',
                'subdiv': 'Chapter',
                'backName': 'Galatians',
                'gridName': 'Gal.',
                'citeFull': 'Galatians'},
        '149': {'id': 149,
                'abbr': 'eph',
                'citeAbbr': 'Eph.',
                'fullName': 'Ephesians',
                'numChapters': 6,
                'urlPath': 'eph/',
                'parentBookId': 2,
                'webTitle': 'The Epistle of Paul the Apostle to the<br /><b class="big">Ephesians</b>',
                'jstTitle': 'NULL',
                'tocName': 'Ephesians',
                'subdiv': 'Chapter',
                'backName': 'Ephesians',
                'gridName': 'Eph.',
                'citeFull': 'Ephesians'},
        '150': {'id': 150,
                'abbr': 'philip',
                'citeAbbr': 'Philip.',
                'fullName': 'Philippians',
                'numChapters': 4,
                'urlPath': 'philip/',
                'parentBookId': 2,
                'webTitle': 'The Epistle of Paul the Apostle to the<br /><b class="big">Philippians</b>',
                'jstTitle': 'NULL',
                'tocName': 'Philippians',
                'subdiv': 'Chapter',
                'backName': 'Philippians',
                'gridName': 'Philip.',
                'citeFull': 'Philippians'},
        '151': {'id': 151,
                'abbr': 'col',
                'citeAbbr': 'Col.',
                'fullName': 'Colossians',
                'numChapters': 4,
                'urlPath': 'col/',
                'parentBookId': 2,
                'webTitle': 'The Epistle of Paul the Apostle to the<br /><b class="big">Colossians</b>',
                'jstTitle': 'NULL',
                'tocName': 'Colossians',
                'subdiv': 'Chapter',
                'backName': 'Colossians',
                'gridName': 'Col.',
                'citeFull': 'Colossians'},
        '152': {'id': 152,
                'abbr': '1 thes',
                'citeAbbr': '1 Thes.',
                'fullName': '1 Thessalonians',
                'numChapters': 5,
                'urlPath': '1_thes/',
                'parentBookId': 2,
                'webTitle': 'The First Epistle of Paul the Apostle to the<br /><b class="big">Thessalonians</b>',
                'jstTitle': 'NULL',
                'tocName': '1 Thessalonians',
                'subdiv': 'Chapter',
                'backName': '1 Thessalonians',
                'gridName': '1 Thes.',
                'citeFull': '1 Thessalonians'},
        '153': {'id': 153,
                'abbr': '2 thes',
                'citeAbbr': '2 Thes.',
                'fullName': '2 Thessalonians',
                'numChapters': 3,
                'urlPath': '2_thes/',
                'parentBookId': 2,
                'webTitle': 'The Second Epistle of Paul the Apostle to the<br /><b class="big">Thessalonians</b>',
                'jstTitle': 'NULL',
                'tocName': '2 Thessalonians',
                'subdiv': 'Chapter',
                'backName': '2 Thessalonians',
                'gridName': '2 Thes.',
                'citeFull': '2 Thessalonians'},
        '154': {'id': 154,
                'abbr': '1 tim',
                'citeAbbr': '1 Tim.',
                'fullName': '1 Timothy',
                'numChapters': 6,
                'urlPath': '1_tim/',
                'parentBookId': 2,
                'webTitle': 'The First Epistle of Paul the Apostle to<br /><b class="big">Timothy</b>',
                'jstTitle': 'NULL',
                'tocName': '1 Timothy',
                'subdiv': 'Chapter',
                'backName': '1 Timothy',
                'gridName': '1 Tim.',
                'citeFull': '1 Timothy'},
        '155': {'id': 155,
                'abbr': '2 tim',
                'citeAbbr': '2 Tim.',
                'fullName': '2 Timothy',
                'numChapters': 4,
                'urlPath': '2_tim/',
                'parentBookId': 2,
                'webTitle': 'The Second Epistle of Paul the Apostle to<br /><b class="big">Timothy</b>',
                'jstTitle': 'NULL',
                'tocName': '2 Timothy',
                'subdiv': 'Chapter',
                'backName': '2 Timothy',
                'gridName': '2 Tim.',
                'citeFull': '2 Timothy'},
        '156': {'id': 156,
                'abbr': 'titus',
                'citeAbbr': 'Titus',
                'fullName': 'Titus',
                'numChapters': 3,
                'urlPath': 'titus/',
                'parentBookId': 2,
                'webTitle': 'The Epistle of Paul to<br /><b class="big">Titus</b>',
                'jstTitle': 'NULL',
                'tocName': 'Titus',
                'subdiv': 'Chapter',
                'backName': 'Titus',
                'gridName': 'Titus',
                'citeFull': 'Titus'},
        '157': {'id': 157,
                'abbr': 'philem',
                'citeAbbr': 'Philem.',
                'fullName': 'Philemon',
                'numChapters': 1,
                'urlPath': 'philem/',
                'parentBookId': 2,
                'webTitle': 'The Epistle of Paul to<br /><b class="big">Philemon</b>',
                'jstTitle': 'NULL',
                'tocName': 'Philemon',
                'subdiv': 'Chapter',
                'backName': 'Philemon',
                'gridName': 'Philem.',
                'citeFull': 'Philemon'},
        '158': {'id': 158,
                'abbr': 'heb',
                'citeAbbr': 'Heb.',
                'fullName': 'To the Hebrews',
                'numChapters': 13,
                'urlPath': 'heb/',
                'parentBookId': 2,
                'webTitle': 'The Epistle of Paul the Apostle to the<br /><b class="big">Hebrews</b>',
                'jstTitle': 'NULL',
                'tocName': 'Hebrews',
                'subdiv': 'Chapter',
                'backName': 'Hebrews',
                'gridName': 'Heb.',
                'citeFull': 'Hebrews'},
        '159': {'id': 159,
                'abbr': 'james',
                'citeAbbr': 'James',
                'fullName': 'The Epistle of James',
                'numChapters': 5,
                'urlPath': 'james/',
                'parentBookId': 2,
                'webTitle': 'The General Epistle of<br /><b class="big">James</b>',
                'jstTitle': 'NULL',
                'tocName': 'James',
                'subdiv': 'Chapter',
                'backName': 'James',
                'gridName': 'James',
                'citeFull': 'James'},
        '160': {'id': 160,
                'abbr': '1 pet',
                'citeAbbr': '1 Pet.',
                'fullName': '1 Peter',
                'numChapters': 5,
                'urlPath': '1_pet/',
                'parentBookId': 2,
                'webTitle': 'The First Epistle General of<br /><b class="big">Peter</b>',
                'jstTitle': 'NULL',
                'tocName': '1 Peter',
                'subdiv': 'Chapter',
                'backName': '1 Peter',
                'gridName': '1 Peter',
                'citeFull': '1 Peter'},
        '161': {'id': 161,
                'abbr': '2 pet',
                'citeAbbr': '2 Pet.',
                'fullName': '2 Peter',
                'numChapters': 3,
                'urlPath': '2_pet/',
                'parentBookId': 2,
                'webTitle': 'The Second Epistle General of<br /><b class="big">Peter</b>',
                'jstTitle': 'NULL',
                'tocName': '2 Peter',
                'subdiv': 'Chapter',
                'backName': '2 Peter',
                'gridName': '2 Peter',
                'citeFull': '2 Peter'},
        '162': {'id': 162,
                'abbr': '1 jn',
                'citeAbbr': '1 Jn.',
                'fullName': '1 John',
                'numChapters': 5,
                'urlPath': '1_jn/',
                'parentBookId': 2,
                'webTitle': 'The First Epistle General of<br /><b class="big">John</b>',
                'jstTitle': 'NULL',
                'tocName': '1 John',
                'subdiv': 'Chapter',
                'backName': '1 John',
                'gridName': '1 John',
                'citeFull': '1 John'},
        '163': {'id': 163,
                'abbr': '2 jn',
                'citeAbbr': '2 Jn.',
                'fullName': '2 John',
                'numChapters': 1,
                'urlPath': '2_jn/',
                'parentBookId': 2,
                'webTitle': 'The Second Epistle of<br /><b class="big">John</b>',
                'jstTitle': 'NULL',
                'tocName': '2 John',
                'subdiv': 'Chapter',
                'backName': '2 John',
                'gridName': '2 John',
                'citeFull': '2 John'},
        '164': {'id': 164,
                'abbr': '3 jn',
                'citeAbbr': '3 Jn.',
                'fullName': '3 John',
                'numChapters': 1,
                'urlPath': '3_jn/',
                'parentBookId': 2,
                'webTitle': 'The Third Epistle of<br /><b class="big">John</b>',
                'jstTitle': 'NULL',
                'tocName': '3 John',
                'subdiv': 'Chapter',
                'backName': '3 John',
                'gridName': '3 John',
                'citeFull': '3 John'},
        '165': {'id': 165,
                'abbr': 'jude',
                'citeAbbr': 'Jude',
                'fullName': 'Jude',
                'numChapters': 1,
                'urlPath': 'jude/',
                'parentBookId': 2,
                'webTitle': 'The General Epistle of<br /><b class="big">Jude</b>',
                'jstTitle': 'NULL',
                'tocName': 'Jude',
                'subdiv': 'Chapter',
                'backName': 'Jude',
                'gridName': 'Jude',
                'citeFull': 'Jude'},
        '166': {'id': 166,
                'abbr': 'rev',
                'citeAbbr': 'Rev.',
                'fullName': 'Revelation',
                'numChapters': 22,
                'urlPath': 'rev/',
                'parentBookId': 2,
                'webTitle': '<b class="big">The Revelation</b><br />of St. John the Divine',
                'jstTitle': 'NULL',
                'tocName': 'Revelation',
                'subdiv': 'Chapter',
                'backName': 'Revelation',
                'gridName': 'Rev.',
                'citeFull': 'Revelation'},
        '201': {'id': 201,
                'abbr': 'ttlpg',
                'citeAbbr': 'BM Title Page',
                'fullName': 'Title Page',
                'numChapters': 0,
                'urlPath': 'bm/ttlpg',
                'parentBookId': 3,
                'webTitle': 'The Book of Mormon',
                'jstTitle': 'NULL',
                'tocName': 'Title Page',
                'subdiv': '',
                'backName': 'Title Page',
                'gridName': 'Title',
                'citeFull': 'Title Page'},
        '202': {'id': 202,
                'abbr': 'intrdctn',
                'citeAbbr': 'BM Intro.',
                'fullName': 'Introduction',
                'numChapters': 0,
                'urlPath': 'bm/intrdctn',
                'parentBookId': 3,
                'webTitle': 'The Book of Mormon<br />Introduction',
                'jstTitle': 'NULL',
                'tocName': 'Introduction',
                'subdiv': '',
                'backName': 'Introduction',
                'gridName': 'Intro.',
                'citeFull': 'Introduction'},
        '203': {'id': 203,
                'abbr': 'thrwtnss',
                'citeAbbr': 'BM Three Wit.',
                'fullName': 'The Testimony of Three Witnesses',
                'numChapters': 0,
                'urlPath': 'bm/thrwtnss',
                'parentBookId': 3,
                'webTitle': 'The Testimony of Three Witnesses',
                'jstTitle': 'NULL',
                'tocName': 'Three Witnesses',
                'subdiv': '',
                'backName': 'Three Witnesses',
                'gridName': '3 Wit.',
                'citeFull': 'Three Witnesses'},
        '204': {'id': 204,
                'abbr': 'eghtwtnss',
                'citeAbbr': 'BM Eight Wit.',
                'fullName': 'The Testimony of Eight Witnesses',
                'numChapters': 0,
                'urlPath': 'bm/eghtwtns',
                'parentBookId': 3,
                'webTitle': 'The Testimony of Eight Witnesses',
                'jstTitle': 'NULL',
                'tocName': 'Eight Witnesses',
                'subdiv': '',
                'backName': 'Eight Witnesses',
                'gridName': '8 Wit.',
                'citeFull': 'Eight Witnesses'},
        '205': {'id': 205,
                'abbr': '1 ne',
                'citeAbbr': '1 Ne.',
                'fullName': 'First Nephi',
                'numChapters': 22,
                'urlPath': '1_ne/',
                'parentBookId': 3,
                'webTitle': 'The First Book of Nephi',
                'jstTitle': 'NULL',
                'tocName': '1 Nephi',
                'subdiv': 'Chapter',
                'backName': '1 Nephi',
                'gridName': '1 Nephi',
                'citeFull': '1 Nephi'},
        '206': {'id': 206,
                'abbr': '2 ne',
                'citeAbbr': '2 Ne.',
                'fullName': 'Second Nephi',
                'numChapters': 33,
                'urlPath': '2_ne/',
                'parentBookId': 3,
                'webTitle': 'The Second Book of Nephi',
                'jstTitle': 'NULL',
                'tocName': '2 Nephi',
                'subdiv': 'Chapter',
                'backName': '2 Nephi',
                'gridName': '2 Nephi',
                'citeFull': '2 Nephi'},
        '207': {'id': 207,
                'abbr': 'jacob',
                'citeAbbr': 'Jacob',
                'fullName': 'Jacob',
                'numChapters': 7,
                'urlPath': 'jacob/',
                'parentBookId': 3,
                'webTitle': 'The Book of Jacob<br /><b class="small">The Brother of Nephi</b>',
                'jstTitle': 'NULL',
                'tocName': 'Jacob',
                'subdiv': 'Chapter',
                'backName': 'Jacob',
                'gridName': 'Jacob',
                'citeFull': 'Jacob'},
        '208': {'id': 208,
                'abbr': 'enos',
                'citeAbbr': 'Enos',
                'fullName': 'Enos',
                'numChapters': 1,
                'urlPath': 'enos/',
                'parentBookId': 3,
                'webTitle': 'The Book of Enos',
                'jstTitle': 'NULL',
                'tocName': 'Enos',
                'subdiv': 'Chapter',
                'backName': 'Enos',
                'gridName': 'Enos',
                'citeFull': 'Enos'},
        '209': {'id': 209,
                'abbr': 'jarom',
                'citeAbbr': 'Jarom',
                'fullName': 'Jarom',
                'numChapters': 1,
                'urlPath': 'jarom/',
                'parentBookId': 3,
                'webTitle': 'The Book of Jarom',
                'jstTitle': 'NULL',
                'tocName': 'Jarom',
                'subdiv': 'Chapter',
                'backName': 'Jarom',
                'gridName': 'Jarom',
                'citeFull': 'Jarom'},
        '210': {'id': 210,
                'abbr': 'omni',
                'citeAbbr': 'Omni',
                'fullName': 'Omni',
                'numChapters': 1,
                'urlPath': 'omni/',
                'parentBookId': 3,
                'webTitle': 'The Book of Omni',
                'jstTitle': 'NULL',
                'tocName': 'Omni',
                'subdiv': 'Chapter',
                'backName': 'Omni',
                'gridName': 'Omni',
                'citeFull': 'Omni'},
        '211': {'id': 211,
                'abbr': 'w of m',
                'citeAbbr': 'W of M',
                'fullName': 'Words of Mormon',
                'numChapters': 1,
                'urlPath': 'w_of_m/',
                'parentBookId': 3,
                'webTitle': 'The Words of Mormon',
                'jstTitle': 'NULL',
                'tocName': 'Words of Morm.',
                'subdiv': 'Chapter',
                'backName': 'W. of Mormon',
                'gridName': 'W of M',
                'citeFull': 'Words of Mormon'},
        '212': {'id': 212,
                'abbr': 'mosiah',
                'citeAbbr': 'Mosiah',
                'fullName': 'Mosiah',
                'numChapters': 29,
                'urlPath': 'mosiah/',
                'parentBookId': 3,
                'webTitle': 'The Book of Mosiah',
                'jstTitle': 'NULL',
                'tocName': 'Mosiah',
                'subdiv': 'Chapter',
                'backName': 'Mosiah',
                'gridName': 'Mosiah',
                'citeFull': 'Mosiah'},
        '213': {'id': 213,
                'abbr': 'alma',
                'citeAbbr': 'Alma',
                'fullName': 'Alma',
                'numChapters': 63,
                'urlPath': 'alma/',
                'parentBookId': 3,
                'webTitle': 'The Book of Alma<br /><b class="small">The Son of Alma</b>',
                'jstTitle': 'NULL',
                'tocName': 'Alma',
                'subdiv': 'Chapter',
                'backName': 'Alma',
                'gridName': 'Alma',
                'citeFull': 'Alma'},
        '214': {'id': 214,
                'abbr': 'hel',
                'citeAbbr': 'Hel.',
                'fullName': 'Helaman',
                'numChapters': 16,
                'urlPath': 'hel/',
                'parentBookId': 3,
                'webTitle': 'The Book of Helaman',
                'jstTitle': 'NULL',
                'tocName': 'Helaman',
                'subdiv': 'Chapter',
                'backName': 'Helaman',
                'gridName': 'Hel.',
                'citeFull': 'Helaman'},
        '215': {'id': 215,
                'abbr': '3 ne',
                'citeAbbr': '3 Ne.',
                'fullName': 'Third Nephi',
                'numChapters': 30,
                'urlPath': '3_ne/',
                'parentBookId': 3,
                'webTitle': 'Third Nephi<br />The Book of Nephi<br /><b class="small">The Son of Nephi, Who Was the Son of Helaman</b>',
                'jstTitle': 'NULL',
                'tocName': '3 Nephi',
                'subdiv': 'Chapter',
                'backName': '3 Nephi',
                'gridName': '3 Nephi',
                'citeFull': '3 Nephi'},
        '216': {'id': 216,
                'abbr': '4 ne',
                'citeAbbr': '4 Ne.',
                'fullName': 'Fourth Nephi',
                'numChapters': 1,
                'urlPath': '4_ne/',
                'parentBookId': 3,
                'webTitle': 'Fourth Nephi<br />The Book of Nephi<br /><b class="small">Who Is the Son of Nephi&mdash;One of the Disciples of Jesus Christ</b>',
                'jstTitle': 'NULL',
                'tocName': '4 Nephi',
                'subdiv': 'Chapter',
                'backName': '4 Nephi',
                'gridName': '4 Nephi',
                'citeFull': '4 Nephi'},
        '217': {'id': 217,
                'abbr': 'morm',
                'citeAbbr': 'Morm.',
                'fullName': 'Mormon',
                'numChapters': 9,
                'urlPath': 'morm/',
                'parentBookId': 3,
                'webTitle': 'The Book of Mormon',
                'jstTitle': 'NULL',
                'tocName': 'Mormon',
                'subdiv': 'Chapter',
                'backName': 'Mormon',
                'gridName': 'Morm.',
                'citeFull': 'Mormon'},
        '218': {'id': 218,
                'abbr': 'ether',
                'citeAbbr': 'Ether',
                'fullName': 'Ether',
                'numChapters': 15,
                'urlPath': 'ether/',
                'parentBookId': 3,
                'webTitle': 'The Book of Ether',
                'jstTitle': 'NULL',
                'tocName': 'Ether',
                'subdiv': 'Chapter',
                'backName': 'Ether',
                'gridName': 'Ether',
                'citeFull': 'Ether'},
        '219': {'id': 219,
                'abbr': 'moro',
                'citeAbbr': 'Moro.',
                'fullName': 'Moroni',
                'numChapters': 10,
                'urlPath': 'moro/',
                'parentBookId': 3,
                'webTitle': 'The Book of Moroni',
                'jstTitle': 'NULL',
                'tocName': 'Moroni',
                'subdiv': 'Chapter',
                'backName': 'Moroni',
                'gridName': 'Moroni',
                'citeFull': 'Moroni'},
        '301': {'id': 301,
                'abbr': 'intro',
                'citeAbbr': 'D&amp;C Intro.',
                'fullName': 'Explanatory Introduction',
                'numChapters': 0,
                'urlPath': 'dc/intro',
                'parentBookId': 4,
                'webTitle': 'The Doctrine and Covenants<br /><br />Explanatory Introduction',
                'jstTitle': 'NULL',
                'tocName': 'Introduction',
                'subdiv': '',
                'backName': 'Introduction',
                'gridName': 'Intro.',
                'citeFull': 'Introduction'},
        '302': {'id': 302,
                'abbr': 'sec',
                'citeAbbr': 'D&amp;C',
                'fullName': 'Sections',
                'numChapters': 138,
                'urlPath': 'dc/',
                'parentBookId': 4,
                'webTitle': 'The Doctrine and Covenants',
                'jstTitle': 'NULL',
                'tocName': 'Sections',
                'subdiv': 'Section',
                'backName': 'Section',
                'gridName': 'Sections',
                'citeFull': 'D&C'},
        '303': {'id': 303,
                'abbr': 'od',
                'citeAbbr': 'O.D.',
                'fullName': 'Official Declarations',
                'numChapters': 2,
                'urlPath': 'od/',
                'parentBookId': 4,
                'webTitle': 'Official Declarations',
                'jstTitle': 'NULL',
                'tocName': 'Official Decl.',
                'subdiv': 'Official Declaration',
                'backName': 'Official Decl.',
                'gridName': 'O.D.',
                'citeFull': 'Official Declaration'},
        '401': {'id': 401,
                'abbr': 'moses',
                'citeAbbr': 'Moses',
                'fullName': 'The Book of Moses',
                'numChapters': 8,
                'urlPath': 'moses/',
                'parentBookId': 5,
                'webTitle': 'Selections from The Book of Moses',
                'jstTitle': 'NULL',
                'tocName': 'Moses',
                'subdiv': 'Chapter',
                'backName': 'Moses',
                'gridName': 'Moses',
                'citeFull': 'Moses'},
        '402': {'id': 402,
                'abbr': 'abr',
                'citeAbbr': 'Abr.',
                'fullName': 'The Book of Abraham',
                'numChapters': 5,
                'urlPath': 'abr/',
                'parentBookId': 5,
                'webTitle': 'The Book of Abraham',
                'jstTitle': 'NULL',
                'tocName': 'Abraham',
                'subdiv': 'Chapter',
                'backName': 'Abraham',
                'gridName': 'Abr.',
                'citeFull': 'Abraham'},
        '403': {'id': 403,
                'abbr': 'fac',
                'citeAbbr': 'Fac.',
                'fullName': 'Facsimiles',
                'numChapters': 3,
                'urlPath': 'abr/fac_',
                'parentBookId': 5,
                'webTitle': 'A Facsimile from The Book of Abraham',
                'jstTitle': 'NULL',
                'tocName': 'Facsimiles',
                'subdiv': 'Facsimile',
                'backName': 'Facsimile',
                'gridName': 'Fac.',
                'citeFull': 'Facsimile'},
        '404': {'id': 404,
                'abbr': 'js m',
                'citeAbbr': 'JS&mdash;M',
                'fullName': 'Joseph Smith&mdash;Matthew',
                'numChapters': 1,
                'urlPath': 'js_m/',
                'parentBookId': 5,
                'webTitle': 'Joseph Smith&mdash;Matthew',
                'jstTitle': 'NULL',
                'tocName': 'JS&mdash;Matthew',
                'subdiv': 'JS&mdash;Matthew',
                'backName': 'JS&mdash;Matthew',
                'gridName': 'JS&mdash;M',
                'citeFull': 'Joseph Smith&mdash;Matthew'},
        '405': {'id': 405,
                'abbr': 'js h',
                'citeAbbr': 'JS&mdash;H',
                'fullName': 'Joseph Smith&mdash;History',
                'numChapters': 1,
                'urlPath': 'js_h/',
                'parentBookId': 5,
                'webTitle': 'Joseph Smith&mdash;History',
                'jstTitle': 'NULL',
                'tocName': 'JS&mdash;History',
                'subdiv': 'JS&mdash;History',
                'backName': 'JS&mdash;History',
                'gridName': 'JS&mdash;H',
                'citeFull': 'Joseph Smith&mdash;History'},
        '406': {'id': 406,
                'abbr': 'a of f',
                'citeAbbr': 'A of F',
                'fullName': 'The Articles of Faith',
                'numChapters': 1,
                'urlPath': 'a_of_f/',
                'parentBookId': 5,
                'webTitle': 'The Articles of Faith<br /><b class="small">Of The Church of Jesus Christ of Latter-day Saints</b>',
                'jstTitle': 'NULL',
                'tocName': 'Articles of Faith',
                'subdiv': 'Articles of Faith',
                'backName': 'Articles of Faith', 'gridName': 'A of F', 'citeFull': 'Articles of Faith'}
    };

    volumeArray = [
        {'id': 1,
                'abbr': 'ot',
                'citeAbbr': 'OT',
                'fullName': 'Old Testament',
                'numChapters': 0,
                'urlPath': 'ot/',
                'parentBookId': 'NULL',
                'webTitle': 'The Old Testament',
                'jstTitle': 'NULL',
                'tocName': 'Old Testament',
                'subdiv': '',
                'backName': 'Old Testament',
                'gridName': 'OT',
                'citeFull': 'Old Testament',
                'minBookId': 101,
                'maxBookId': 139},
        {'id': 2,
                'abbr': 'nt',
                'citeAbbr': 'NT',
                'fullName': 'New Testament',
                'numChapters': 0,
                'urlPath': 'nt/',
                'parentBookId': 'NULL',
                'webTitle': 'The New Testament',
                'jstTitle': 'NULL',
                'tocName': 'New Testament',
                'subdiv': '',
                'backName': 'New Testament',
                'gridName': 'NT',
                'citeFull': 'New Testament',
                'minBookId': 140,
                'maxBookId': 166},
        {'id': 3,
                'abbr': 'bm',
                'citeAbbr': 'B of M',
                'fullName': 'Book of Mormon',
                'numChapters': 0,
                'urlPath': 'bm/',
                'parentBookId': 'NULL',
                'webTitle': 'The Book of Mormon',
                'jstTitle': 'NULL',
                'tocName': 'Book of Mormon',
                'subdiv': '',
                'backName': 'Book of Mormon',
                'gridName': 'B of M',
                'citeFull': 'Book of Mormon',
                'minBookId': 201,
                'maxBookId': 219},
        {'id': 4,
                'abbr': 'dc',
                'citeAbbr': 'D&amp;C',
                'fullName': 'Doctrine and Covenants',
                'numChapters': 138,
                'urlPath': 'dc/',
                'parentBookId': 'NULL',
                'webTitle': 'The Doctrine and Covenants',
                'jstTitle': 'NULL',
                'tocName': 'Doctrine and Covenants',
                'subdiv': 'Section',
                'backName': 'Doctrine and Covenants',
                'gridName': 'D & C',
                'citeFull': 'Doctrine and Covenants',
                'minBookId': 301,
                'maxBookId': 303},
        {'id': 5,
                'abbr': 'pgp',
                'citeAbbr': 'P of GP',
                'fullName': 'Pearl of Great Price',
                'numChapters': 0,
                'urlPath': 'pgp/',
                'parentBookId': 'NULL',
                'webTitle': 'The Pearl of Great Price',
                'jstTitle': 'NULL',
                'tocName': 'Pearl of Great Price',
                'subdiv': '',
                'backName': 'Pearl of Great Price',
                'gridName': 'P of GP',
                'citeFull': 'Pearl of Great Price',
                'minBookId': 401,
                'maxBookId': 406}
    ];

    /*------------------------------------------------------------------------
     *                      PRE-PROCESSING
     */
    // Cache an array of the books associated with each volume.
    // We add this array as the "books" property of the volume object.
    volumeArray.forEach(function (volume) {
        var volumeBooks = [];
        var i = volume.minBookId;

        while (i <= volume.maxBookId) {
            volumeBooks.push(books[i]);
            i += 1;
        }

        volume.books = volumeBooks;
    });

    return publicInterface;
}());

// TEST CODE
/*
var runNextPrevTest = function (volume, firstBookChapter) {
    var bookChapter = firstBookChapter;
    var previousBookChapter = firstBookChapter;

    console.log(volume);

    while (bookChapter !== undefined) {
        previousBookChapter = bookChapter;
        console.log("next: " + bookChapter[0] + ", " + bookChapter[1]);
        bookChapter = Scriptures.nextChapter(bookChapter[0], bookChapter[1]);
    }

    bookChapter = previousBookChapter;

    while (bookChapter !== undefined) {
        previousBookChapter = bookChapter;
        console.log("prev: " + bookChapter[0] + ", " + bookChapter[1]);
        bookChapter = Scriptures.prevChapter(bookChapter[0], bookChapter[1]);
    }

    if (previousBookChapter[0] !== firstBookChapter[0] || previousBookChapter[1] !== firstBookChapter[1]) {
        console.log(">>>>>>>>>>>>>>>>> TEST FAILURE: Did not end on starting chapter.");
    } else {
        console.log("----------------- TEST PASSED");
    }
}

runNextPrevTest("Bible", [101, 1]);
runNextPrevTest("Book of Mormon", [201, 0]);
runNextPrevTest("Doctrine and Covenants", [301, 0]);
runNextPrevTest("Pearl of Great Price", [401, 1]);

var showBooksForVolume = function (volume) {
    console.log("---------- Volume: " + volume.fullName);

    volume.books.forEach(function (book) {
        console.log(book.fullName);
    });
}

Scriptures.volumes().forEach(function (volume) {
    showBooksForVolume(volume);
});
*/
