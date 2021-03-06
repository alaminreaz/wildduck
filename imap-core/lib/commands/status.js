'use strict';

const imapTools = require('../imap-tools');
const imapHandler = require('../handler/imap-handler');

// tag STATUS "mailbox" (UNSEEN UIDNEXT)

module.exports = {
    state: ['Authenticated', 'Selected'],

    schema: [
        {
            name: 'mailbox',
            type: 'string'
        },
        {
            name: 'query',
            type: 'array'
        }
    ],

    handler(command, callback) {
        let mailbox = Buffer.from((command.attributes[0] && command.attributes[0].value) || '', 'binary').toString();
        let query = command.attributes[1] && command.attributes[1];

        let statusElements = ['MESSAGES', 'RECENT', 'UIDNEXT', 'UIDVALIDITY', 'UNSEEN', 'HIGHESTMODSEQ'];
        let statusItem;
        let statusQuery = [];

        // Check if STATUS method is set
        if (typeof this._server.onStatus !== 'function') {
            return callback(null, {
                response: 'NO',
                message: 'STATUS not implemented'
            });
        }

        if (!mailbox) {
            // nothing to check for if mailbox is not defined
            return callback(null, {
                response: 'NO',
                code: 'CANNOT',
                message: 'No folder name given'
            });
        }

        if (!Array.isArray(query)) {
            return callback(null, {
                response: 'BAD',
                message: 'Invalid arguments for STATUS'
            });
        }

        // check if status elements are listed
        if (!query.length) {
            return callback(null, {
                response: 'BAD',
                message: 'Empty status list'
            });
        }

        // check if only known status items are used
        for (let i = 0, len = query.length; i < len; i++) {
            statusItem = ((query[i] && query[i].value) || '').toString().toUpperCase();
            if (statusElements.indexOf(statusItem) < 0) {
                return callback(null, {
                    response: 'BAD',
                    message: 'Invalid status items'
                });
            }
            if (statusQuery.indexOf(statusItem) < 0) {
                statusQuery.push(statusItem);
            }
        }

        mailbox = imapTools.normalizeMailbox(mailbox, !this.acceptUTF8Enabled);

        // mark CONDSTORE as enabled
        if (statusQuery.indexOf('HIGHESTMODSEQ') >= 0 && !this.condstoreEnabled) {
            this.condstoreEnabled = true;
            if (this.selected) {
                this.selected.condstoreEnabled = true;
            }
        }

        this._server.onStatus(mailbox, this.session, (err, data) => {
            let response;
            let values = {
                RECENT: 0
            };

            if (err) {
                return callback(err);
            }

            if (typeof data === 'string') {
                return callback(null, {
                    response: 'NO',
                    code: data.toUpperCase()
                });
            }

            if (data) {
                response = {
                    tag: '*',
                    command: 'STATUS',
                    attributes: [
                        command.attributes[0], // reuse the mailbox declaration from client command
                        []
                    ]
                };
                Object.keys(data).forEach(key => {
                    values[key.toUpperCase()] = (data[key] || '').toString();
                });

                statusQuery.forEach(key => {
                    response.attributes[1].push({
                        type: 'atom',
                        value: key.toUpperCase()
                    });
                    response.attributes[1].push({
                        type: 'atom',
                        value: (values[key] || '0').toString()
                    });
                });

                this.send(imapHandler.compiler(response));
            }

            callback(null, {
                response: 'OK'
            });
        });
    }
};
