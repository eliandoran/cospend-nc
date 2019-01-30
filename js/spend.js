/*jshint esversion: 6 */
/**
 * Nextcloud - Spend
 *
 *
 * This file is licensed under the Affero General Public License version 3 or
 * later. See the COPYING file.
 *
 * @author Julien Veyssier <eneiluj@posteo.net>
 * @copyright Julien Veyssier 2019
 */
(function ($, OC) {
    'use strict';

    //////////////// VAR DEFINITION /////////////////////
    var MEMBER_NAME_EDITION = 1;
    var MEMBER_WEIGHT_EDITION = 2;

    var PROJECT_NAME_EDITION = 1;
    var PROJECT_PASSWORD_EDITION = 2;

    var spend = {
        restoredSelectedProjectId: null,
        memberEditionMode: null,
        projectEditionMode: null,
        projectDeletionTimer: null,
        letterColors: {},
        // indexed by projectid, then by billid
        bills: {},
        // indexed by projectid, then by memberid
        members: {},
        projects: {}
    };

    //////////////// UTILS /////////////////////

    function getLetterColor(letter) {
        var letterIndex = letter.toLowerCase().charCodeAt(0) - 'a'.charCodeAt(0);
        var letterCoef = letterIndex / 26;
        var h = letterCoef * 360;
        var s = 70 + letterCoef * 10;
        var l = 50 + letterCoef * 10;
        return {h: Math.round(h), s: Math.round(s), l: Math.round(l)};
    }

    function Timer(callback, delay) {
        var timerId, start, remaining = delay;

        this.pause = function() {
            window.clearTimeout(timerId);
            remaining -= new Date() - start;
        };

        this.resume = function() {
            start = new Date();
            window.clearTimeout(timerId);
            timerId = window.setTimeout(callback, remaining);
        };

        this.resume();
    }

    function pad(n) {
        return (n < 10) ? ('0' + n) : n;
    }

    function endsWith(str, suffix) {
        return str.indexOf(suffix, str.length - suffix.length) !== -1;
    }

    function basename(str) {
        var base = String(str).substring(str.lastIndexOf('/') + 1);
        if (base.lastIndexOf(".") !== -1) {
            base = base.substring(0, base.lastIndexOf("."));
        }
        return base;
    }

    /*
     * get key events
     */
    function checkKey(e) {
        e = e || window.event;
        var kc = e.keyCode;
        //console.log(kc);

        // key '<'
        if (kc === 60 || kc === 220) {
            e.preventDefault();
        }

        if (e.key === 'Escape') {
        }
    }

    function createProject(id, name, password) {
        var req = {
            id: id,
            name: name,
            password: password
        };
        var url = OC.generateUrl('/apps/spend/createProject');
        $.ajax({
            type: 'POST',
            url: url,
            data: req,
            async: true,
        }).done(function (response) {
            addProject({
                id: id,
                name: name,
                contact_email: '',
                members: [],
                active_members: [],
                balance: {}
            });

            var div = $('#newprojectdiv');
            div.slideUp();
            $(this).removeClass('icon-triangle-s').addClass('icon-triangle-e');
        }).always(function() {
        }).fail(function(response) {
            OC.Notification.showTemporary(t('spend', 'Failed to create project') + ' ' + response.responseText);
        });
    }

    function createMember(projectid, name) {
        var req = {
            projectid: projectid,
            name: name
        };
        var url = OC.generateUrl('/apps/spend/addMember');
        $.ajax({
            type: 'POST',
            url: url,
            data: req,
            async: true,
        }).done(function (response) {
            var member = {
                id: response,
                name: name,
                weight: 1,
                activated: true
            };
            // add member to UI
            addMember(projectid, member, 0);
            // fold new member form
            $('#newmemberdiv').slideUp();
            updateNumberOfMember(projectid);
        }).always(function() {
        }).fail(function(response) {
            OC.Notification.showTemporary(t('spend', 'Failed to add member') + ' ' + response.responseText);
        });
    }

    function editMember(projectid, memberid, newName, newWeight, newActivated) {
        var req = {
            projectid: projectid,
            memberid: memberid,
            name: newName,
            weight: newWeight,
            activated: newActivated
        };
        var url = OC.generateUrl('/apps/spend/editMember');
        $.ajax({
            type: 'POST',
            url: url,
            data: req,
            async: true,
        }).done(function (response) {
            var memberLine = $('.projectitem[projectid='+projectid+'] ul.memberlist > li[memberid='+memberid+']');
            // update member values
            if (newName) {
                memberLine.find('b.memberName').text(newName);
                spend.members[projectid][memberid].name = newName;
            }
            if (newWeight) {
                memberLine.find('b.memberWeight').text(newWeight);
                spend.members[projectid][memberid].weight = newWeight;
                updateProjectBalances(projectid);
            }
            if (newActivated !== null && newActivated === false) {
                memberLine.find('>a').removeClass('icon-user').addClass('icon-disabled-user');
                memberLine.find('.toggleMember span').first().removeClass('icon-delete').addClass('icon-history');
                memberLine.find('.toggleMember span').eq(1).text(t('spend', 'Reactivate'));
                spend.members[projectid][memberid].activated = newActivated;
            }
            else if (newActivated !== null && newActivated === true) {
                memberLine.find('>a').removeClass('icon-disabled-user').addClass('icon-user');
                memberLine.find('.toggleMember span').first().removeClass('icon-history').addClass('icon-delete');
                memberLine.find('.toggleMember span').eq(1).text(t('spend', 'Remove'));
                spend.members[projectid][memberid].activated = newActivated;
            }
            // remove editing mode
            memberLine.removeClass('editing');
            OC.Notification.showTemporary(t('spend', 'Member successfully edited'));
        }).always(function() {
        }).fail(function(response) {
            OC.Notification.showTemporary(t('spend', 'Failed to edit member') + ' ' + response.responseText);
        });
    }

    function editProject(projectid, newName, newEmail, newPassword) {
        var req = {
            projectid: projectid,
            name: newName,
            contact_email: newEmail,
            password: newPassword
        };
        var url = OC.generateUrl('/apps/spend/editProject');
        $.ajax({
            type: 'POST',
            url: url,
            data: req,
            async: true,
        }).done(function (response) {
            var projectLine = $('.projectitem[projectid='+projectid+']');
            // update project values
            if (newName) {
                projectLine.find('>a span').text(newName);
                spend.projects[projectid].name = newName;
            }
            // remove editing mode
            projectLine.removeClass('editing');
            OC.Notification.showTemporary(t('spend', 'Project successfully edited'));
        }).always(function() {
        }).fail(function(response) {
            OC.Notification.showTemporary(t('spend', 'Failed to edit project') + ' ' + response.responseText);
        });
    }

    function updateNumberOfMember(projectid) {
        var nbMembers = $('li.projectitem[projectid='+projectid+'] ul.memberlist > li').length;
        $('li.projectitem[projectid='+projectid+'] .app-navigation-entry-utils-counter').text(nbMembers);
    }

    function deleteProject(id) {
        var req = {
            projectid: id
        };
        var url = OC.generateUrl('/apps/spend/deleteProject');
        $.ajax({
            type: 'POST',
            url: url,
            data: req,
            async: true,
        }).done(function (response) {
            $('.projectitem[projectid='+id+']').fadeOut('slow', function() {
                $(this).remove();
            });
            OC.Notification.showTemporary(t('spend', 'Deleted project {id}', {id: id}));
        }).always(function() {
        }).fail(function(response) {
            OC.Notification.showTemporary(t('spend', 'Failed to delete project') + ' ' + response.responseText);
        });
    }

    function getProjects() {
        var req = {
        };
        var url = OC.generateUrl('/apps/spend/getProjects');
        spend.currentGetProjectsAjax = $.ajax({
            type: 'POST',
            url: url,
            data: req,
            async: true,
            xhr: function() {
                var xhr = new window.XMLHttpRequest();
                xhr.addEventListener('progress', function(evt) {
                    if (evt.lengthComputable) {
                        var percentComplete = evt.loaded / evt.total * 100;
                        //$('#loadingpc').text(parseInt(percentComplete) + '%');
                    }
                }, false);

                return xhr;
            }
        }).done(function (response) {
            for (var i = 0; i < response.length; i++) {
                addProject(response[i]);
            }
        }).always(function() {
            spend.currentGetProjectsAjax = null;
        }).fail(function() {
            OC.Notification.showTemporary(t('spend', 'Failed to contact server to get projects'));
        });
    }

    function getBills(projectid) {
        var req = {
            projectid: projectid
        };
        var url = OC.generateUrl('/apps/spend/getBills');
        spend.currentGetProjectsAjax = $.ajax({
            type: 'POST',
            url: url,
            data: req,
            async: true,
        }).done(function (response) {
            $('#bill-list').html('');
            spend.bills[projectid] = {};
            var bill;
            for (var i = 0; i < response.length; i++) {
                bill = response[i];
                addBill(projectid, bill);
            }
        }).always(function() {
        }).fail(function() {
            OC.Notification.showTemporary(t('spend', 'Failed to get bills'));
        });
    }

    function getProjectName(projectid) {
        return spend.projects[projectid].name;
    }

    function displayBill(projectid, billid) {
        var bill = spend.bills[projectid][billid];
        var projectName = getProjectName(projectid);

        var owers = bill.owers;
        var owerIds = [];
        for (var i=0; i < owers.length; i++) {
            owerIds.push(owers[i].id);
        }

        var owerCheckboxes = '';
        var payerOptions = '';
        var member;
        var selected, checked;
        for (var memberid in spend.members[projectid]) {
            member = spend.members[projectid][memberid];
            // payer
            selected = '';
            if (member.id === bill.payer_id) {
                selected = ' selected';
            }
            payerOptions = payerOptions + `<option value="${member.id}"${selected}>${member.name}</option>`;
            // owers
            checked = '';
            if (owerIds.indexOf(member.id) !== -1) {
                checked = ' checked';
            }
            owerCheckboxes = owerCheckboxes + `
                <div class="owerEntry">
                <input id="${projectid}${member.id}" owerid="${member.id}" type="checkbox"${checked}/>
                <label for="${projectid}${member.id}">${member.name}</label>
                </div>
            `;
        }
        $('#bill-detail').html('');
        var detail = `
            <h2 class="bill-title">${t('spend', 'Bill "{what}" of project {proj}', {what: bill.what, proj: projectName})}</h2>
            <div class="bill-form">
                <div class="bill-left">
                    <div class="bill-what">
                        <a class="icon icon-tag"></a><span>${t('spend', 'What?')}</span><br/>
                        <input type="text" class="input-bill-what" value="${bill.what}"/>
                    </div>
                    <div class="bill-payer">
                        <a class="icon icon-user"></a><span>${t('spend', 'Who payed?')}</span><br/>
                        <select class="input-bill-payer">
                            ${payerOptions}
                        </select>
                    </div>
                    <div class="bill-date">
                        <a class="icon icon-calendar-dark"></a><span>${t('spend', 'When?')}</span><br/>
                        <input type="date" class="input-bill-date" value="${bill.date}"/>
                    </div>
                    <div class="bill-amount">
                        <a class="icon icon-quota"></a><span>${t('spend', 'How much?')}</span><br/>
                        <input type="number" class="input-bill-amount" value="${bill.amount}" step="0.01" min="0"/>
                    </div>
                </div>
                <div class="bill-right">
                    <div class="bill-owers">
                        <a class="icon icon-group"></a><span>${t('spend', 'For whom?')}</span>
                        ${owerCheckboxes}
                    </div>
                </div>
            </div>
        `;

        $(detail).appendTo('#bill-detail');
    }

    function getMemberName(projectid, memberid) {
        //var memberName = $('.projectitem[projectid='+projectid+'] .memberlist > li[memberid='+memberid+'] b.memberName').text();
        var memberName = spend.members[projectid][memberid].name;
        return memberName;
    }

    function addBill(projectid, bill) {
        spend.bills[projectid][bill.id] = bill;
        //'id' => $dbBillId,
        //'amount' => $dbAmount,
        //'what' => $dbWhat,
        //'date' => $dbDate,
        //'payer_id' => $dbPayerId,
        //'owers' => $billOwersByBill[$row['id']]
        var owerNames = '';
        var ower;
        for (var i=0; i < bill.owers.length; i++) {
            ower = bill.owers[i];
            owerNames = owerNames + getMemberName(projectid, ower.id) + ', ';
        }
        owerNames = owerNames.replace(/, $/, '');
        var memberName = getMemberName(projectid, bill.payer_id);
        var memberFirstLetter = memberName[0];

        var title = bill.what + '\n' + bill.amount.toFixed(2) + '\n' +
            bill.date + '\n' + memberName + ' -> ' + owerNames;
        var c = spend.letterColors[memberFirstLetter.toLowerCase()];
        var item = `<a href="#" class="app-content-list-item billitem" billid="${bill.id}" projectid="${projectid}" title="${title}">
            <div class="app-content-list-item-icon" style="background-color: hsl(${c.h}, ${c.s}%, ${c.l}%);">${memberFirstLetter}</div>
            <div class="app-content-list-item-line-one">${bill.what}</div>
            <div class="app-content-list-item-line-two">${bill.amount.toFixed(2)} (${memberName} -> ${owerNames})</div>
            <span class="app-content-list-item-details">${bill.date}</span>
            <div class="icon-delete"></div>
        </a>`;
        $(item).prependTo('.app-content-list');
    }

    function updateProjectBalances(projectid) {
        var req = {
            projectid: projectid
        };
        var url = OC.generateUrl('/apps/spend/getProjectInfo');
        spend.currentGetProjectsAjax = $.ajax({
            type: 'POST',
            url: url,
            data: req,
            async: true,
        }).done(function (response) {
            console.log(response);
            var balance, balanceField, balanceClass;
            for (var memberid in response.balance) {
                balance = response.balance[memberid];
                balanceField = $('.projectitem[projectid='+projectid+'] .memberlist > li[memberid='+memberid+'] b.balance');
                balanceField.removeClass('balancePositive').removeClass('balanceNegative');
                if (balance < 0) {
                    balanceClass = 'balanceNegative';
                    balanceField.addClass(balanceClass).text(balance.toFixed(2));
                }
                else if (balance > 0) {
                    balanceClass = 'balancePositive';
                    balanceField.addClass(balanceClass).text(balance.toFixed(2));
                }
                else {
                    balanceField.text(balance.toFixed(2));
                }
            }
        }).always(function() {
        }).fail(function() {
            OC.Notification.showTemporary(t('spend', 'Failed to get bills'));
        });
    }

    function addProject(project) {
        spend.projects[project.id] = project;

        var name = project.name;
        var projectid = project.id;
        var projectSelected = '';
        if (spend.restoredSelectedProjectId === projectid) {
            projectSelected = ' open';
            getBills(projectid);
        }
        var li = `<li class="projectitem collapsible${projectSelected}" projectid="${projectid}"><a class="icon-folder" href="#" title="${projectid}">
                <span>${name}</span>
            </a>
            <div class="app-navigation-entry-utils">
                <ul>
                    <li class="app-navigation-entry-utils-counter">${project.members.length}</li>
                    <li class="app-navigation-entry-utils-menu-button">
                        <button></button>
                    </li>
                </ul>
            </div>
            <div class="app-navigation-entry-edit">
                <div>
                    <input type="text" value="${project.name}" class="editProjectInput">
                    <input type="submit" value="" class="icon-close editProjectClose">
                    <input type="submit" value="" class="icon-checkmark editProjectOk">
                </div>
            </div>
            <div class="app-navigation-entry-menu">
                <ul>
                    <li>
                        <a href="#" class="addMember">
                            <span class="icon-add"></span>
                            <span>${t('spend', 'Add member')}</span>
                        </a>
                    </li>
                    <li>
                        <a href="#" class="editProjectName">
                            <span class="icon-rename"></span>
                            <span>${t('spend', 'Rename')}</span>
                        </a>
                    </li>
                    <li>
                        <a href="#" class="editProjectPassword">
                            <span class="icon-rename"></span>
                            <span>${t('spend', 'Change password')}</span>
                        </a>
                    </li>
                    <li>
                        <a href="#" class="deleteProject">
                            <span class="icon-delete"></span>
                            <span>${t('spend', 'Delete')}</span>
                        </a>
                    </li>
                </ul>
            </div>
            <div class="app-navigation-entry-deleted">
                <div class="app-navigation-entry-deleted-description">${t('spend', 'Deleted {id}', {id: project.id})}</div>
                <button class="app-navigation-entry-deleted-button icon-history undoDeleteProject" title="Undo"></button>
            </div>
            <ul class="memberlist"></ul>
            </li>`;

        $(li).appendTo('#projectlist');

        for (var i=0; i < project.members.length; i++) {
            var memberId = project.members[i].id;
            addMember(projectid, project.members[i], project.balance[memberId]);
        }
    }

    function addMember(projectid, member, balance) {
        // add member to dict
        if (!spend.members.hasOwnProperty(projectid)) {
            spend.members[projectid] = {};
        }
        spend.members[projectid][member.id] = member;

        var balanceStr;
        if (balance > 0) {
            balanceStr = '<b class="balance balancePositive">+'+balance.toFixed(2)+'</b>';
        }
        else if (balance < 0) {
            balanceStr = '<b class="balance balanceNegative">'+balance.toFixed(2)+'</b>';
        }
        else {
            balanceStr = '<b class="balance">'+balance.toFixed(2)+'</b>';
        }
        var iconStr, iconToggleStr, toggleStr;
        if (member.activated) {
            iconStr = 'icon-user';
            iconToggleStr = 'icon-delete';
            toggleStr = t('spend', 'Remove');
        }
        else {
            iconStr = 'icon-disabled-user';
            iconToggleStr = 'icon-history';
            toggleStr = t('spend', 'Reactivate');
        }

        var li = `<li memberid="${member.id}" class="memberitem"><a class="${iconStr}" href="#">
                <span><b class="memberName">${member.name}</b> (x<b class="memberWeight">${member.weight}</b>) ${balanceStr}</span>
            </a>
            <div class="app-navigation-entry-utils">
                <ul>
                    <!--li class="app-navigation-entry-utils-counter">1</li-->
                    <li class="app-navigation-entry-utils-menu-button">
                        <button></button>
                    </li>
                </ul>
            </div>
            <div class="app-navigation-entry-menu">
                <ul>
                    <li>
                        <a href="#" class="renameMember">
                            <span class="icon-rename"></span>
                            <span>${t('spend', 'Rename')}</span>
                        </a>
                    </li>
                    <li>
                        <a href="#" class="editWeightMember">
                            <span class="icon-rename"></span>
                            <span>${t('spend', 'Change weight')}</span>
                        </a>
                    </li>
                    <li>
                        <a href="#" class="toggleMember">
                            <span class="${iconToggleStr}"></span>
                            <span>${toggleStr}</span>
                        </a>
                    </li>
                </ul>
            </div>
            <div class="app-navigation-entry-edit">
                <div>
                    <input type="text" value="${member.name}" class="editMemberInput">
                    <input type="submit" value="" class="icon-close editMemberClose">
                    <input type="submit" value="" class="icon-checkmark editMemberOk">
                </div>
            </div>
        </li>`;

        $(li).appendTo('#projectlist li.projectitem[projectid='+projectid+'] .memberlist');
    }

    function saveOptionValue(optionValues) {
        if (!spend.pageIsPublic) {
            var req = {
                options: optionValues
            };
            var url = OC.generateUrl('/apps/spend/saveOptionValue');
            $.ajax({
                type: 'POST',
                url: url,
                data: req,
                async: true
            }).done(function (response) {
            }).fail(function() {
                OC.Notification.showTemporary(
                    t('spend', 'Failed to save option values')
                );
            });
        }
    }

    function restoreOptions() {
        var mom;
        var url = OC.generateUrl('/apps/spend/getOptionsValues');
        var req = {
        };
        var optionsValues = {};
        $.ajax({
            type: 'POST',
            url: url,
            data: req,
            async: true
        }).done(function (response) {
            optionsValues = response.values;
            if (optionsValues) {
                for (var k in optionsValues) {
                    if (k === 'selectedProject') {
                        spend.restoredSelectedProjectId = optionsValues[k];
                    }
                }
            }
            // quite important ;-)
            main();
        }).fail(function() {
            OC.Notification.showTemporary(
                t('spend', 'Failed to restore options values')
            );
        });
    }


    $(document).ready(function() {
        spend.pageIsPublic = (document.URL.indexOf('/whatever') !== -1);
        if ( !spend.pageIsPublic ) {
            restoreOptions();
        }
        else {
            //restoreOptionsFromUrlParams();
            main();
        }
    });

    function main() {
        // generate colors
        var alphabet = "abcdefghijklmnopqrstuvwxyz".split("");
        _.each(alphabet, function(letter) {
            spend.letterColors[letter] = getLetterColor(letter);
        });

        // get key events
        document.onkeydown = checkKey;

        window.onclick = function(event) {
            if (!event.target.matches('.app-navigation-entry-utils-menu-button button')) {
                $('.app-navigation-entry-menu.open').removeClass('open');
            }
            if (!event.target.matches('#newmemberdiv, #newmemberdiv input, #newmemberdiv label, #newmemberdiv button, .addMember, .addMember span')) {
                $('#newmemberdiv').slideUp();
            }
            //console.log(event.target);
        }

        $('body').on('click', '.app-navigation-entry-utils-menu-button', function(e) {
            var wasOpen = $(this).parent().parent().parent().find('>.app-navigation-entry-menu').hasClass('open');
            $('.app-navigation-entry-menu.open').removeClass('open');
            if (!wasOpen) {
                $(this).parent().parent().parent().find('>.app-navigation-entry-menu').addClass('open');
            }
        });

        $('body').on('click', '.projectitem > a', function(e) {
            var wasOpen = $(this).parent().hasClass('open');
            $('.projectitem.open').removeClass('open');
            if (!wasOpen) {
                $(this).parent().addClass('open');
                var projectid = $(this).parent().attr('projectid');
                saveOptionValue({selectedProject: projectid});
                getBills(projectid);
            }
        });

        $('#newprojectbutton').click(function() {
            var div = $('#newprojectdiv');
            if (div.is(':visible')) {
                div.slideUp();
                $(this).removeClass('icon-triangle-s').addClass('icon-triangle-e');
            }
            else {
                div.slideDown();
                $(this).removeClass('icon-triangle-e').addClass('icon-triangle-s');
            }
        });

        $('#projectnameinput, #projectidinput, #projectpasswordinput').on('keyup', function(e) {
            if (e.key === 'Enter') {
                var name = $('#projectnameinput').val();
                var id = $('#projectidinput').val();
                var password = $('#projectpasswordinput').val();
                if (name && id && password) {
                    createProject(id, name);
                }
                else {
                    OC.Notification.showTemporary(t('spend', 'Invalid values'));
                }
            }
        });

        $('#createproject').click(function() {
            var name = $('#projectnameinput').val();
            var id = $('#projectidinput').val();
            var password = $('#projectpasswordinput').val();
            if (name && id && password) {
                createProject(id, name);
            }
            else {
                OC.Notification.showTemporary(t('spend', 'Invalid values'));
            }
        });

        $('body').on('click', '.deleteProject', function(e) {
            var id = $(this).parent().parent().parent().parent().attr('projectid');
            $(this).parent().parent().parent().parent().addClass('deleted');
            spend.projectDeletionTimer = new Timer(function() {
                deleteProject(id);
            }, 7000);
        });

        $('body').on('click', '.undoDeleteProject', function(e) {
            $(this).parent().parent().removeClass('deleted');
            spend.projectDeletionTimer.pause();
            spend.projectDeletionTimer = null;
        });

        $('body').on('click', '.addMember', function(e) {
            var id = $(this).parent().parent().parent().parent().attr('projectid');
            var name = $('.projectitem[projectid='+id+'] > a > span').text();
            $('#newmemberdiv').slideDown();
            $('#newmemberdiv #newmemberbutton').text(t('spend', 'Add member to project {pname}', {pname: name}));
            $('#newmemberdiv #newmemberbutton').attr('projectid', id);
        });

        $('#newmemberbutton').click(function() {
            var projectid = $(this).attr('projectid');
            var name = $(this).parent().find('input').val();
            if (projectid && name) {
                createMember(projectid, name);
            }
            else {
                OC.Notification.showTemporary(t('spend', 'Invalid values'));
            }
        });

        $('#newmembername').on('keyup', function(e) {
            if (e.key === 'Enter') {
                var name = $(this).val();
                var projectid = $(this).parent().find('button').attr('projectid');
                if (projectid && name) {
                    createMember(projectid, name);
                }
                else {
                    OC.Notification.showTemporary(t('spend', 'Invalid values'));
                }
            }
        });

        $('body').on('click', '.renameMember', function(e) {
            var projectid = $(this).parent().parent().parent().parent().parent().parent().attr('projectid');
            var name = $(this).parent().parent().parent().parent().find('a > span > b.memberName').text();
            $(this).parent().parent().parent().parent().find('.editMemberInput').val(name).focus();
            $('.memberlist li').removeClass('editing');
            $(this).parent().parent().parent().parent().addClass('editing');
            spend.memberEditionMode = MEMBER_NAME_EDITION;
        });

        $('body').on('click', '.editWeightMember', function(e) {
            var projectid = $(this).parent().parent().parent().parent().parent().parent().attr('projectid');
            var weight = $(this).parent().parent().parent().parent().find('a > span > b.memberWeight').text();
            $(this).parent().parent().parent().parent().find('.editMemberInput').val(weight).focus();
            $('.memberlist li').removeClass('editing');
            $(this).parent().parent().parent().parent().addClass('editing');
            spend.memberEditionMode = MEMBER_WEIGHT_EDITION;
        });

        $('body').on('click', '.editMemberClose', function(e) {
            $(this).parent().parent().parent().removeClass('editing');
        });

        $('body').on('click', '.editMemberOk', function(e) {
            var memberid = $(this).parent().parent().parent().attr('memberid');
            var projectid = $(this).parent().parent().parent().parent().parent().attr('projectid');
            if (spend.memberEditionMode === MEMBER_NAME_EDITION) {
                var newName = $(this).parent().find('.editMemberInput').val();
                editMember(projectid, memberid, newName, null, null);
            }
            else if (spend.memberEditionMode === MEMBER_WEIGHT_EDITION) {
                var newWeight = $(this).parent().find('.editMemberInput').val();
                var newName = $(this).parent().parent().parent().find('b.memberName').text();
                editMember(projectid, memberid, newName, newWeight, null);
            }
        });

        $('body').on('click', '.toggleMember', function(e) {
            var memberid = $(this).parent().parent().parent().parent().attr('memberid');
            var projectid = $(this).parent().parent().parent().parent().parent().parent().attr('projectid');
            var newName = $(this).parent().parent().parent().parent().find('>a span b.memberName').text();
            var activated = $(this).find('span').first().hasClass('icon-history');
            editMember(projectid, memberid, newName, null, activated);
        });

        $('body').on('click', '.editProjectName', function(e) {
            var projectid = $(this).parent().parent().parent().parent().attr('projectid');
            var name = $(this).parent().parent().parent().parent().find('>a > span').text();
            $(this).parent().parent().parent().parent().find('.editProjectInput').val(name).attr('type', 'text').focus();
            $('#projectlist > li').removeClass('editing');
            $(this).parent().parent().parent().parent().removeClass('open').addClass('editing');
            spend.projectEditionMode = PROJECT_NAME_EDITION;
        });

        $('body').on('click', '.editProjectPassword', function(e) {
            var projectid = $(this).parent().parent().parent().parent().attr('projectid');
            $(this).parent().parent().parent().parent().find('.editProjectInput').attr('type', 'password').val('').focus();
            $('#projectlist > li').removeClass('editing');
            $(this).parent().parent().parent().parent().removeClass('open').addClass('editing');
            spend.projectEditionMode = PROJECT_PASSWORD_EDITION;
        });

        $('body').on('click', '.editProjectClose', function(e) {
            $(this).parent().parent().parent().removeClass('editing');
        });

        $('body').on('click', '.editProjectOk', function(e) {
            var projectid = $(this).parent().parent().parent().attr('projectid');
            if (spend.projectEditionMode === PROJECT_NAME_EDITION) {
                var newName = $(this).parent().find('.editProjectInput').val();
                editProject(projectid, newName, null, null);
            }
            else if (spend.projectEditionMode === PROJECT_PASSWORD_EDITION) {
                var newPassword = $(this).parent().find('.editProjectInput').val();
                var newName = $(this).parent().parent().parent().find('>a span').text();
                editProject(projectid, newName, null, newPassword);
            }
        });

        $('body').on('click', '.billitem', function(e) {
            var billid = $(this).attr('billid');
            var projectid = $(this).attr('projectid');
            displayBill(projectid, billid);
        });

        // last thing to do : get the projects
        if (!spend.pageIsPublic) {
            getProjects();
        }
        else {
        }
    }

})(jQuery, OC);
