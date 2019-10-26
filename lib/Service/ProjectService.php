<?php

/**
 * Nextcloud - cospend
 *
 * This file is licensed under the Affero General Public License version 3 or
 * later. See the COPYING file.
 *
 * @author Julien Veyssier
 * @copyright Julien Veyssier 2019
 */

namespace OCA\Cospend\Service;

use OCP\IL10N;
use OCP\ILogger;
use OCP\DB\QueryBuilder\IQueryBuilder;

use OC\Archive\ZIP;
use OCA\Cospend\Db\ProjectMapper;
use OCP\IGroupManager;

class ProjectService {

    private $l10n;
    private $logger;
    private $qb;
    private $dbconnection;

    public function __construct (ILogger $logger, IL10N $l10n, ProjectMapper $projectMapper, IGroupManager $groupManager) {
        $this->l10n = $l10n;
        $this->logger = $logger;
        $this->qb = \OC::$server->getDatabaseConnection()->getQueryBuilder();
        $this->dbconnection = \OC::$server->getDatabaseConnection();
        $this->projectMapper = $projectMapper;
        $this->groupManager = $groupManager;
    }

    private function db_quote_escape_string($str){
        return $this->dbconnection->quote($str);
    }

    public function findUsers($id) {
        $userIds = [];
        // get owner with mapper
        $proj = $this->projectMapper->find($id);
        array_push($userIds, $proj->getUserid());

        // get user shares from project id
        $qb = $this->dbconnection->getQueryBuilder();
        $qb->select('userid')
            ->from('cospend_shares', 's')
            ->where(
                $qb->expr()->eq('isgroupshare', $qb->createNamedParameter(0, IQueryBuilder::PARAM_INT))
            )
            ->andWhere(
                $qb->expr()->eq('projectid', $qb->createNamedParameter($id, IQueryBuilder::PARAM_STR))
            );
        $req = $qb->execute();
        while ($row = $req->fetch()) {
            if (!in_array($row['userid'], $userIds)) {
                array_push($userIds, $row['userid']);
            }
        }
        $req->closeCursor();
        $qb = $qb->resetQueryParts();

        // get group shares from project id
        $qb->select('userid')
            ->from('cospend_shares', 's')
            ->where(
                $qb->expr()->eq('isgroupshare', $qb->createNamedParameter(1, IQueryBuilder::PARAM_INT))
            )
            ->andWhere(
                $qb->expr()->eq('projectid', $qb->createNamedParameter($id, IQueryBuilder::PARAM_STR))
            );
        $req = $qb->execute();
        $groupIds = [];
        while ($row = $req->fetch()) {
            array_push($groupIds, $row['userid']);
        }
        $req->closeCursor();
        $qb = $qb->resetQueryParts();
        // get users of groups
        foreach ($groupIds as $gid) {
            $group = $this->groupManager->get($gid);
            if ($group !== null) {
                $groupUsers = $group->getUsers();
                foreach ($groupUsers as $user) {
                    $uid = $user->getUID();
                    if (!in_array($uid, $userIds)) {
                        array_push($userIds, $uid);
                    }
                }
            }
        }

        return $userIds;
    }

}
