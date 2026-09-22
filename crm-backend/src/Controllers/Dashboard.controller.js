const express = require("express");
const mongoose = require("mongoose");
//import model

const Dashboard= require("../Models/Dashboard.Model");
// const { data } = require("framer-motion/client");
const Dashboards = require("../Models/Dashboard.Model");

// Create Product
const createProfile = async (req, res) => {
    const { id, name, email, status } = req.body;

  //1.collect data
  // const productData=req.body;

  2; //store data in database
  const newProfile = await Dashboard.insertOne(req.body);
  console.log("data storing", newProfile);

  res.json({ message: " data stored", newProfile:req.body});
};

2.// to get data from database by using find
// FIND BY ID (GET)
const findProfileById = async (req, res) => {
  try {
    console.log("find request received");

    const profile = await Dashboard.findOne({
      id: req.params.id,
    });

    if (!profile) {
      return res.status(404).json({
        message: "Customer not found",
      });
    }

    res.status(200).json(profile);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: "Server Error",
    });
  }
};


3.// update data by id
const updateProfileById = async (req, res) => {
  try {
    const updatedData = await Dashboard.findOneAndUpdate(
      { id: Number(req.params.id) },
      req.body,
      { new: true }
    );

    if (!updatedData) {
      return res.status(404).json({
        message: "Customer not found",
      });
    }

    res.status(200).json({
      message: "Updated Successfully",
      updatedData,
    });

  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: error.message,
    });
  }
};

// DELETE BY ID (DELETE)
const deleteProfileById = async (req, res) => {
  try {
    const deletedCustomer = await Dashboard.findOneAndDelete({
      id: req.params.id,
    });

    if (!deletedCustomer) {
      return res.status(404).json({
        message: "Customer not found",
      });
    }

    res.status(200).json({
      message: "Customer deleted successfully",
      data: deletedCustomer,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};


module.exports = {
    createProfile,
  findProfileById,
  updateProfileById,
  deleteProfileById,
};