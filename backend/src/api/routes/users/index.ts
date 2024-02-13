import { achievementsConfig } from "@/common/config";
import prisma from "@/common/prisma";
import { errorHandler } from "@/common/utils";
import { AchievementConfig, FetchedUser, Theme } from "codetierlist-types";
import express from "express";

const router = express.Router();

/**
 * Get user info
 * @public
 */
router.get("/", (req, res) => {
    res.send(req.user satisfies FetchedUser);
});

/**
 * Sets the user's theme to the specified theme.
 * @param theme the theme to set. Must be "LIGHT" or "DARK".
 * @returns 200 if success, 400 if fail
 *
 * @public
 */
router.post("/theme", errorHandler(async (req, res) => {
    if (!req.body.theme) {
        res.status(400).send({message:"No theme specified."});

        return;
    }
    if (req.body.theme !== "LIGHT" && req.body.theme !== "DARK") {
        res.status(400).send({message:`Invalid theme ${req.body.theme}.`});
        return;
    }

    await prisma.user.update({
        where: {utorid: req.user.utorid},
        data: {theme: req.body.theme satisfies Theme}
    });

    res.status(200).send({message:`Set theme to ${req.body.theme}.`});

}));

/**
 * get the achievements of the user
 * @public
 */
router.get("/achievements", errorHandler(async (req, res) => {
    const achievements = await prisma.achievement.findMany({
        where: {utorid: req.user.utorid}
    });
    if (req.user.new_achievements) {
        await prisma.user.update({
            where: {utorid: req.user.utorid},
            data: {new_achievements: false}
        });
    }
    res.status(200).send(achievementsConfig.map((achievement) => {
        if (achievements.some((userAchievement) => userAchievement.id === achievement.id)) {
            const {config : _, ...rest} = achievement;
            return rest;
        } else {
            return {id: -1, type: "", name: "", description: "", icon: "unknown.png"};
        }
    }).sort((a,b)=>{
        if(a.id === -1) return 1;
        if(b.id === -1) return -1;
        return 0;
    }) as AchievementConfig[]);
}));

export default router;
